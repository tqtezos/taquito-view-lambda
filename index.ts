
const { Tezos } = require('@taquito/taquito');
const { Schema } = require('@taquito/michelson-encoder');
const { ml2mic } = require('@taquito/utils');
const util = require('util');

const fs = require("fs");

const fa12_address = 'KT1RUhPAABRhZBctcsWFtymyjpuBQdLTqaAQ';

function p(x) {
  console.log(util.inspect(x, false, null, true /* enable colors */));
}

async function get_entrypoint_type({target_contract_address, target_entrypoint_name='default'}:
                                   {target_contract_address:string, target_entrypoint_name?: string}): Promise<object> {
  const target_contract = await Tezos.contract.at(target_contract_address).catch(err => {throw new Error(`get_entrypoint_type: contract not found ${target_contract_address}`)});
  const target_entrypoint = target_contract?.entrypoints?.entrypoints[target_entrypoint_name];
  if (target_entrypoint) {
    return target_entrypoint;
  } else {
    throw new Error(`Contract ${target_contract_address} does not have entrypoint: ${target_entrypoint_name}`);
  }
}

async function get_view_entrypoint_types({target_contract_address, target_entrypoint_name='default'}:
                                         {target_contract_address:string, target_entrypoint_name?: string}): Promise<[object, object]> {
  const entrypoint_type = await get_entrypoint_type({target_contract_address: target_contract_address, target_entrypoint_name: target_entrypoint_name});
  if (entrypoint_type['prim'] === 'pair') {
    const entrypoint_type_args = Array.from(entrypoint_type['args']) as [object, object];
    if (entrypoint_type_args.length == 2) {
      return entrypoint_type_args;
    } else {
      throw new Error(`Expected an Array of length 2, but found: ${entrypoint_type_args}`);
    }
  } else {
    throw new Error(`Expected {'prim': 'pair', ..} but found {'prim': ${entrypoint_type['prim']}, ..}`);
  }
}

const id_contract_code =
  [ { prim: '',
      args:
       [ [ { prim: 'parameter',
             args:
              [ { prim: 'lambda',
                  args:
                   [ { prim: 'unit', args: [] },
                     { prim: 'pair',
                       args:
                        [ { prim: 'list', args: [ { prim: 'operation', args: [] } ] },
                          { prim: 'unit', args: [] } ] } ] } ] },
           { prim: 'storage', args: [ { prim: 'unit', args: [] } ] },
           { prim: 'code',
             args:
              [ [ { prim: 'CAR', args: [] },
                  { prim: 'UNIT', args: [] },
                  { prim: 'EXEC', args: [] } ] ] } ] ] } ];

async function view_to_void_lambda({exec_lambda_address, target_contract_address, target_contract_parameter, target_contract_entrypoint='default'}:
                                   {exec_lambda_address: string, target_contract_address: string, target_contract_parameter: any, target_contract_entrypoint?: string}): Promise<object> {
  const entrypoint_types = await get_view_entrypoint_types({target_contract_address: fa12_address, target_entrypoint_name: target_contract_entrypoint});
  const parameter_type = entrypoint_types[0];
  const callback_type = entrypoint_types[1];
  return (
    [ { prim: '',
        args:
         [ [ { prim: 'PUSH',
               args: [ { prim: 'mutez', args: [] }, { int: '0' } ] },
             { prim: 'NONE', args: [ { prim: 'key_hash', args: [] } ] },
             { prim: 'CREATE_CONTRACT',
               args:
                [ [ { prim: 'parameter', args: [ callback_type ] },
                    { prim: 'storage', args: [ { prim: 'unit', args: [] } ] },
                    { prim: 'code', args: [ [ { prim: 'FAILWITH', args: [] } ] ] } ] ] },
             { prim: 'DIP',
               args:
                [ [ { prim: 'DIP',
                      args:
                       [ [ { prim: 'LAMBDA (pair address unit) (pair address unit)',
                             args:
                              [ [ { prim: 'CAR', args: [] },
                                  { prim: 'CONTRACT', args: [ callback_type ] },
                                  { prim: 'IF_NONE',
                                    args:
                                     [ [ { prim: 'PUSH',
                                           args:
                                            [ { prim: 'string', args: [] }, { string: 'Callback type unmatched' } ] },
                                         { prim: 'FAILWITH', args: [] } ] ] },
                                  { prim: '', args: [ [] ] },
                                  { prim: 'PUSH',
                                    args: [ parameter_type, target_contract_parameter ] },
                                  { prim: 'PAIR', args: [] },
                                  { prim: 'DIP',
                                    args:
                                     [ [ { prim: 'PUSH',
                                           args:
                                            [ { prim: 'address', args: [] },
                                              { string: target_contract_address } ] },
                                         { prim: 'DUP', args: [] },
                                         { prim: 'CONTRACT',
                                           args:
                                             [ { prim: `%${target_contract_entrypoint}`, args: [] },
                                               { prim: 'pair',
                                                 args:
                                                   [ parameter_type,
                                                     { prim: 'contract', args: [ callback_type ] } ] } ] },
                                         { prim: 'IF_NONE',
                                           args: [ [ { prim: 'FAILWITH', args: [] } ] ] },
                                         { prim: '',
                                           args:
                                            [ [ { prim: 'DIP', args: [ [ { prim: 'DROP', args: [] } ] ] } ] ] },
                                         { prim: 'PUSH',
                                           args: [ { prim: 'mutez', args: [] }, { int: '0' } ] } ] ] },
                                  { prim: 'TRANSFER_TOKENS', args: [] },
                                  { prim: 'DIP',
                                    args:
                                     [ [ { prim: 'NIL', args: [ { prim: 'operation', args: [] } ] } ] ] },
                                  { prim: 'CONS', args: [] },
                                  { prim: 'DIP', args: [ [ { prim: 'UNIT', args: [] } ] ] },
                                  { prim: 'PAIR', args: [] } ] ] } ] ] },
                    { prim: 'APPLY', args: [] },
                    { prim: 'DIP',
                      args:
                       [ [ { prim: 'PUSH',
                             args:
                              [ { prim: 'address', args: [] },
                                { string: exec_lambda_address } ] },
                           { prim: 'DUP', args: [] },
                           { prim: 'CONTRACT',
                             args:
                              [ { prim: 'lambda',
                                  args:
                                   [ { prim: 'unit', args: [] },
                                     { prim: 'pair',
                                       args:
                                        [ { prim: 'list', args: [ { prim: 'operation', args: [] } ] },
                                          { prim: 'unit', args: [] } ] } ] } ] },
                           { prim: 'IF_NONE',
                             args: [ [ { prim: 'FAILWITH', args: [] } ] ] },
                           { prim: '',
                             args:
                              [ [ { prim: 'DIP', args: [ [ { prim: 'DROP', args: [] } ] ] } ] ] },
                           { prim: 'PUSH',
                             args: [ { prim: 'mutez', args: [] }, { int: '0' } ] } ] ] },
                    { prim: 'TRANSFER_TOKENS', args: [] },
                    { prim: 'DIP',
                      args:
                       [ [ { prim: 'NIL', args: [ { prim: 'operation', args: [] } ] } ] ] },
                    { prim: 'CONS', args: [] } ] ] },
             { prim: 'CONS', args: [] },
             { prim: 'DIP', args: [ [ { prim: 'UNIT', args: [] } ] ] },
             { prim: 'PAIR', args: [] } ] ] } ]);
}

const test_lambda =
  [ { prim: "PUSH",
      args: [ { prim: "mutez" }, { int: "0" } ] },
    { prim: "NONE", args: [ { prim: "key_hash" } ] },
    { prim: "CREATE_CONTRACT",
      args:
        [ [ { prim: "parameter",
              args: [ { prim: "nat" } ] },
            { prim: "storage",
              args: [ { prim: "unit" } ] },
            { prim: "code",
              args: [ [ { prim: "FAILWITH" } ] ] } ] ] },
    { prim: "DIP",
      args:
        [ [ { prim: "DIP",
              args:
                [ [ { prim: "LAMBDA",
                      args:
                        [ { prim: "pair",
                            args:
                              [ { prim: "address" },
                                { prim: "unit" } ] },
                          { prim: "pair",
                            args:
                              [ { prim: "list",
                                  args:
                                    [ { prim: "operation" } ] },
                                { prim: "unit" } ] },
                          [ { prim: "CAR" },
                            { prim: "CONTRACT",
                              args: [ { prim: "nat" } ] },
                            { prim: "IF_NONE",
                              args:
                                [ [ { prim: "PUSH",
                                      args:
                                        [ { prim:
                                              "string" },
                                          { string:
                                              "Not 'Tc 'CNat" } ] },
                                    { prim: "FAILWITH" } ],
                                  [] ] },
                            { prim: "PUSH",
                              args:
                                [ { prim: "unit" },
                                  { prim: "Unit" } ] },
                            { prim: "PAIR" },
                            { prim: "DIP",
                              args:
                                [ [ { prim: "PUSH",
                                      args:
                                        [ { prim:
                                              "address" },
                                          { string:
                                              "KT1Rc9HR6dqBf6MxN6cCJjDZ6PidaxvT93U8" } ] },
                                    { prim: "DUP" },
                                    { prim: "CONTRACT",
                                      args:
                                        [ { prim: "pair",
                                            args:
                                              [ { prim:
                                                  "unit" },
                                                { prim:
                                                  "contract",
                                                  args:
                                                  [ { prim:
                                                  "nat" } ] } ] } ] },
                                    { prim: "IF_NONE",
                                      args:
                                        [ [ { prim:
                                                "FAILWITH" } ],
                                          [ { prim: "DIP",
                                              args:
                                                [ [ { prim:
                                                  "DROP" } ] ] } ] ] },
                                    { prim: "PUSH",
                                      args:
                                        [ { prim: "mutez" },
                                          { int: "0" } ] } ] ] },
                            { prim: "TRANSFER_TOKENS" },
                            { prim: "DIP",
                              args:
                                [ [ { prim: "NIL",
                                      args:
                                        [ { prim:
                                              "operation" } ] } ] ] },
                            { prim: "CONS" },
                            { prim: "DIP",
                              args:
                                [ [ { prim: "UNIT" } ] ] },
                            { prim: "PAIR" } ] ] } ] ] },
            { prim: "APPLY" },
            { prim: "DIP",
              args:
                [ [ { prim: "PUSH",
                      args:
                        [ { prim: "address" },
                          { string:
                              "KT1NFUsGvAomSSNnKjps8RL1EjGKfWQmM4iw" } ] },
                    { prim: "DUP" },
                    { prim: "CONTRACT",
                      args:
                        [ { prim: "lambda",
                            args:
                              [ { prim: "unit" },
                                { prim: "pair",
                                  args:
                                    [ { prim: "list",
                                        args:
                                          [ { prim:
                                                "operation" } ] },
                                      { prim: "unit" } ] } ] } ] },
                    { prim: "IF_NONE",
                      args:
                        [ [ { prim: "FAILWITH" } ],
                          [ { prim: "DIP",
                              args:
                                [ [ { prim: "DROP" } ] ] } ] ] },
                    { prim: "PUSH",
                      args:
                        [ { prim: "mutez" },
                          { int: "0" } ] } ] ] },
            { prim: "TRANSFER_TOKENS" },
            { prim: "DIP",
              args:
                [ [ { prim: "NIL",
                      args: [ { prim: "operation" } ] } ] ] },
            { prim: "CONS" } ] ] }, { prim: "CONS" },
    { prim: "DIP", args: [ [ { prim: "UNIT" } ] ] },
    { prim: "PAIR" } ];

async function send_retry(method, args, n=0) {
  try {
    console.log(`Retry number ${n}`);
    return await method.send(args)
  } catch(err) {
    if(err.message.match(/Counter \d+ already used for contract/) || err.message.match(/contract\.counter_in_the_past/) || err.message.match(/upstream request timeout/)) {
      return await send_retry(method, args, n+1)
    } else {
      throw err
    }
  }
}

async function main() {
  const { email, password, mnemonic, secret } = JSON.parse(fs.readFileSync('/Users/michaelklein/Downloads/tz1R3vJ5TV8Y5pVj8dicBR23Zv8JArusDkYr.json').toString());
  Tezos.setProvider({ rpc: 'https://api.tez.ie/rpc/babylonnet' });
  Tezos.importKey(email, password, mnemonic.join(" "), secret);

  const lambda_parameter = await view_to_void_lambda({exec_lambda_address: 'KT1NFUsGvAomSSNnKjps8RL1EjGKfWQmM4iw',
                                                      target_contract_address: 'KT1XQKa1N6e9VNLyNbhc6UMEZRJbnAb3wqAg',
                                                      target_contract_parameter: ml2mic('Unit'),
                                                      target_contract_entrypoint: 'getTotalSupply'});
/*   p(lambda_parameter); */


  /* const target_contract = await Tezos.contract.at('KT1NFUsGvAomSSNnKjps8RL1EjGKfWQmM4iw'); */
  const target_contract = await Tezos.contract.at('KT1E1trWsE1A9yrbgNeRJC54VCYgEtrbYLSE');
  /* p('see this'); */
  /* p(target_contract.methods.main(lambda_parameter)); */
  /* p('end'); */
  /* p(target_contract.methods.main); */
  /* throw Error('hi') */
  /* p(target_contract); */
  /* p(target_contract.methods.main(simple_lambda).schema); */

  var resp;
  try {
    resp = await send_retry(target_contract.methods.main(test_lambda), { amount: 0 });
    await resp.confirmation()
    /* p(resp); */
    /* const (results : OperationContentsAndResult[]) */

    /* p(resp.results[0].metadata.internal_operation_results.map(x => { */
    /*   return [typeof x, x?.result, x?.result?.status, typeof x?.result?.status, x?.result?.status == 'failed', x?.result?.status === 'failed']; */
    /* })); */
    if (resp.results?.length !== 1) {
      throw Error('Response results not singleton')
    }
    const failed_internal_operations = 
      resp.results[0]?.metadata?.internal_operation_results?.filter(x => {
      return x?.result?.status === 'failed';
    });
    /* p(failed_internal_operations); */
    if (failed_internal_operations.length !== 1) {
      throw Error('Failed internal operaations not singleton')
    }
    const failed_internal_operation = failed_internal_operations[0];
    /* p(failed_internal_operation?.parameters) */
    p(failed_internal_operation?.parameters?.value)

    /* p(resp.results[0].metadata.internal_operation_results.filter(x => { */
    /*   return x?.result?.status === 'failed'; */
    /* })); */
    /* p(resp.results.length); */
    /* p(resp.errors); */
    /* .send(); */
  } catch(e) {
    p(e);
    /* console.log(e.message); */
  }
  /* console.log('Response:'); */
  /* p(resp.body); */

}

main()

