import fs from "fs";
import util from "util";
import { Tezos } from "@taquito/taquito";
import voidLambda from "./void_lambda";

function log(x: any) {
  console.log(util.inspect(x, false, null, true /* enable colors */));
}

async function getEntrypoint(
  contractAddress: string,
  entrypointName: string = "default"
): Promise<object> {
  const response = await Tezos.rpc.getEntrypoints(contractAddress);
  const entrypoint = response.entrypoints[entrypointName];

  if (!entrypoint) {
    throw Error(
      `Contract ${contractAddress} does not have entrypoint: ${entrypointName}`
    );
  }

  return entrypoint;
}

/* Expected form: */
/* [ { prim: 'unit' }, */
/*   { prim: 'contract', args: [ { prim: 'nat' } ] } ] */
async function getViewEntrypoints(
  contractAddress: string,
  entrypointName: string = "default"
): Promise<[object, object]> {
  const entrypoint: any = await getEntrypoint(contractAddress, entrypointName);

  if (entrypoint["prim"] !== "pair") {
    throw Error(
      `Expected {'prim': 'pair', ..} but found {'prim': ${entrypoint["prim"]}, ..}`
    );
  }

  const args = Array.from(entrypoint["args"]) as [any, any];

  if (args.length !== 2) {
    throw Error(`Expected an Array of length 2, but found: ${args}`);
  }

  const [parameter, callbackContract] = args;

  if (callbackContract["prim"] !== "contract") {
    throw Error(
      `Expected a {prim: 'contract', ...}, but found: ${callbackContract["prim"]}`
    );
  }

  if (callbackContract["args"]?.length !== 1) {
    throw Error(
      `Expected a single argument to 'contract', but found: ${callbackContract["args"]}`
    );
  }

  return [parameter, callbackContract["args"][0]];
}

async function viewToVoidLambda(
  execLambdaAddress: string,
  contractAddress: string,
  contractParameter: any,
  contractEntrypoint: string = "default"
): Promise<object> {
  const [parameter, callback] = await getViewEntrypoints(
    contractAddress,
    contractEntrypoint
  );

  let contractArgs: any;
  if (contractEntrypoint === "default") {
    contractArgs = [
      { string: `%${contractEntrypoint}` },
      {
        prim: "pair",
        args: [parameter, { prim: "contract", args: [callback] }]
      }
    ];
  } else {
    contractArgs = [
      {
        prim: "pair",
        args: [parameter, { prim: "contract", args: [callback] }]
      }
    ];
  }

  return voidLambda({
    callback,
    parameter,
    contractParameter,
    contractAddress,
    contractArgs,
    execLambdaAddress
  });
}

async function sendRetry(method: any, args: any, n: number = 0): Promise<any> {
  try {
    return await method.send(args);
  } catch (err) {
    if (
      err.message.match(/Counter \d+ already used for contract/) ||
      err.message.match(/contract\.counter_in_the_past/) ||
      err.message.match(/upstream request timeout/)
    ) {
      console.log(`Retry number ${n + 1}`);
      return await sendRetry(method, args, n + 1);
    }

    throw err;
  }
}

async function main() {
  Tezos.setProvider({ rpc: "https://api.tez.ie/rpc/babylonnet" });

  const lambdaAddress = "KT1E1trWsE1A9yrbgNeRJC54VCYgEtrbYLSE";
  const fa12Address = "KT1RUhPAABRhZBctcsWFtymyjpuBQdLTqaAQ";

  const lambdaParameter = await viewToVoidLambda(
    lambdaAddress,
    fa12Address,
    { prim: "Unit" },
    "getTotalSupply"
  );

  const contract = await Tezos.contract.at(lambdaAddress);

  let resp: any;
  try {
    const mainMethod = contract.methods.main(lambdaParameter);
    resp = await sendRetry(mainMethod, { amount: 0 });
    await resp.confirmation();

    if (resp.results?.length !== 1) {
      throw Error("Response results not singleton");
    }
    const failedInternalOperations = resp.results[0]?.metadata?.internal_operation_results?.filter(
      (x: any) => x?.result?.status === "failed"
    );

    if (failedInternalOperations.length !== 1) {
      throw Error("Failed internal operaations not singleton");
    }

    const failedInternalOperation = failedInternalOperations[0];

    log({ result: failedInternalOperation?.parameters?.value });
    log(resp.results[0]);
  } catch (e) {
    log(e);
  }
}

main();
