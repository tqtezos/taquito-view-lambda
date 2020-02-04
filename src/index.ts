import fs from "fs";
import util from "util";
import { Tezos } from "@taquito/taquito";
import { MichelsonV1Expression } from "@taquito/rpc";
import {
  ContractMethod,
  LegacyContractMethod
} from "@taquito/taquito/dist/types/contract/contract";
import { TransactionOperation } from "@taquito/taquito/dist/types/operations/transaction-operation";
import voidLambda from "./void_lambda";

type Expr = MichelsonV1Expression;
type Method = ContractMethod | LegacyContractMethod;

interface ISendParams {
  fee?: number;
  storageLimit?: number;
  gasLimit?: number;
  amount?: number;
}

type SendParams = ISendParams | undefined;

function log(x: any) {
  console.log(util.inspect(x, false, null, true /* enable colors */));
}

async function getEntrypoint(
  contractAddress: string,
  entrypointName: string = "default"
): Promise<Expr> {
  const response = await Tezos.rpc.getEntrypoints(contractAddress);
  const entrypoint = response.entrypoints[entrypointName];

  if (!entrypoint) {
    throw Error(
      `Contract ${contractAddress} does not have entrypoint: ${entrypointName}`
    );
  }

  return entrypoint;
}

function validateEntrypoint(entrypoint: Expr) {
  if (!("prim" in entrypoint) || !entrypoint.args) {
    // TODO: Enhance this error message to be more descriptive
    throw Error("Entrypoint args undefined");
  }

  const args = Array.from(entrypoint.args) as [Expr, Expr];
  const [parameter, callbackContract] = args;

  if (!("prim" in callbackContract) || !callbackContract.args) {
    // TODO: Enhance this error message to be more descriptive
    throw Error("Callback contract args undefined");
  }

  let message;
  if (entrypoint.prim !== "pair") {
    message = `Expected {'prim': 'pair', ..} but found {'prim': ${entrypoint.prim}, ..}`;
  } else if (args.length !== 2) {
    message = `Expected an Array of length 2, but found: ${args}`;
  } else if (callbackContract.prim !== "contract") {
    message = `Expected a {prim: 'contract', ...}, but found: ${callbackContract.prim}`;
  } else if (callbackContract.args?.length !== 1) {
    message = `Expected a single argument to 'contract', but found: ${callbackContract.args}`;
  }

  if (message) throw Error(message);

  return [parameter, callbackContract.args[0]] as [Expr, Expr];
}

/* Expected form: */
/* [ { prim: 'unit' }, */
/*   { prim: 'contract', args: [ { prim: 'nat' } ] } ] */
async function getViewEntrypoint(
  contractAddress: string,
  entrypointName: string = "default"
): Promise<[Expr, Expr]> {
  const entrypoint = await getEntrypoint(contractAddress, entrypointName);
  return validateEntrypoint(entrypoint);
}

async function viewToVoidLambda(
  lambdaAddress: string,
  contractAddress: string,
  contractParameter: Expr,
  entrypointName: string = "default"
): Promise<object> {
  const entrypoint = await getViewEntrypoint(contractAddress, entrypointName);
  const [parameter, callback] = entrypoint;

  let contractArgs: Expr[] = [
    {
      prim: "pair",
      args: [parameter, { prim: "contract", args: [callback] }]
    }
  ];

  if (entrypointName === "default") {
    contractArgs = ([{ string: "%default" }] as Expr[]).concat(contractArgs);
  }

  return voidLambda({
    callback,
    parameter,
    contractParameter,
    contractAddress,
    contractArgs,
    lambdaAddress
  });
}

async function sendRetry(
  method: Method,
  args: SendParams,
  n: number = 0
): Promise<TransactionOperation> {
  try {
    return await method.send(args);
  } catch (err) {
    if (
      err.message.match(/Counter \d+ already used for contract/) ||
      err.message.match(/contract\.counter_in_the_past/) ||
      err.message.match(/upstream request timeout/)
    ) {
      console.log(err.message);
      console.log(`Retry number ${n + 1}...`);
      return await sendRetry(method, args, n + 1);
    }

    throw err;
  }
}

async function main() {
  const keyFile = process.argv[2];
  if (!keyFile) {
    console.error("No key faucet file provided.");
    process.exit(1);
  }
  const { email, password, mnemonic, secret } = JSON.parse(
    fs.readFileSync(keyFile).toString()
  );
  Tezos.setProvider({ rpc: "https://api.tez.ie/rpc/babylonnet" });
  Tezos.importKey(email, password, mnemonic.join(" "), secret);

  const lambdaAddress = "KT1E1trWsE1A9yrbgNeRJC54VCYgEtrbYLSE";
  const fa12Address = "KT1RUhPAABRhZBctcsWFtymyjpuBQdLTqaAQ";

  const lambdaParameter = await viewToVoidLambda(
    lambdaAddress,
    fa12Address,
    { prim: "Unit" },
    "getTotalSupply"
  );

  const lambdaContract = await Tezos.contract.at(lambdaAddress);
  lambdaContract.storage();

  try {
    const mainMethod = lambdaContract.methods.main(lambdaParameter);

    const response = await sendRetry(mainMethod, { amount: 0 });
    await response.confirmation();

    if (response.results?.length !== 1) {
      throw Error("Response results not singleton");
    }

    const internalOpResults =
      response.results[0]?.metadata?.internal_operation_results;
    const failedInternalOperations = internalOpResults.filter(
      (x: any) => x?.result?.status === "failed"
    );

    if (failedInternalOperations.length !== 1) {
      throw Error("Failed internal operaations not singleton");
    }

    const failedInternalOperation = failedInternalOperations[0];

    log({ result: failedInternalOperation?.parameters?.value });
    log(response.results[0]);
  } catch (e) {
    process.stdout.write("[FATAL]: ");
    log(e);
    process.exit(1);
  }
}

main();
