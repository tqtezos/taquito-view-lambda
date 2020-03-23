import { MichelsonV1Expression } from "@taquito/rpc";

interface VoidLambdaParams {
  callback: object;
  parameter: object;
  contractParameter: MichelsonV1Expression;
  contractAddress: string;
  contractArgs: MichelsonV1Expression[];
  lambdaAddress: string;
  entrypoint: string;
}

export default function (params: VoidLambdaParams) {
  const {
    callback,
    parameter,
    contractParameter,
    contractAddress,
    contractArgs,
    lambdaAddress,
    entrypoint
  } = params;

  return [
    { prim: "PUSH", args: [{ prim: "mutez" }, { int: "0" }] },
    { prim: "NONE", args: [{ prim: "key_hash" }] },
    {
      prim: "CREATE_CONTRACT",
      args: [
        [
          { prim: "parameter", args: [callback] },
          { prim: "storage", args: [{ prim: "unit" }] },
          {
            prim: "code", args: [[{ prim: 'CAR' }, { prim: "FAILWITH" }]]
          }
        ]
      ]
    },
    {
      prim: "DIP",
      args: [
        [
          {
            prim: "DIP",
            args: [
              [
                {
                  prim: "LAMBDA",
                  args: [
                    {
                      prim: "pair",
                      args: [{ prim: "address" }, { prim: "unit" }]
                    },
                    {
                      prim: "pair",
                      args: [
                        { prim: "list", args: [{ prim: "operation" }] },
                        { prim: "unit" }
                      ]
                    },
                    [
                      { prim: "CAR" },
                      { prim: "CONTRACT", args: [callback] },
                      {
                        prim: "IF_NONE",
                        args: [
                          [
                            {
                              prim: "PUSH",
                              args: [
                                { prim: "string" },
                                { string: `Callback type unmatched` }
                              ]
                            },
                            { prim: "FAILWITH" }
                          ],
                          []
                        ]
                      },
                      {
                        prim: "PUSH",
                        args: [parameter, contractParameter]
                      },
                      { prim: "PAIR" },
                      {
                        prim: "DIP",
                        args: [
                          [
                            {
                              prim: "PUSH",
                              args: [
                                { prim: "address" },
                                { string: `${contractAddress}%${entrypoint}` }
                              ]
                            },
                            { prim: "DUP" },
                            { prim: "CONTRACT", args: contractArgs },
                            {
                              prim: "IF_NONE",
                              args: [
                                [{
                                  prim: "PUSH",
                                  args: [
                                    { prim: "string" },
                                    { string: `Contract does not exists` }
                                  ]
                                }, { prim: "FAILWITH" }],
                                [{ prim: "DIP", args: [[{ prim: "DROP" }]] }]
                              ]
                            },
                            {
                              prim: "PUSH",
                              args: [{ prim: "mutez" }, { int: "0" }]
                            }
                          ]
                        ]
                      },
                      { prim: "TRANSFER_TOKENS" },
                      {
                        prim: "DIP",
                        args: [[{ prim: "NIL", args: [{ prim: "operation" }] }]]
                      },
                      { prim: "CONS" },
                      { prim: "DIP", args: [[{ prim: "UNIT" }]] },
                      { prim: "PAIR" }
                    ]
                  ]
                }
              ]
            ]
          },
          { prim: "APPLY" },
          {
            prim: "DIP",
            args: [
              [
                {
                  prim: "PUSH",
                  args: [{ prim: "address" }, { string: lambdaAddress }]
                },
                { prim: "DUP" },
                {
                  prim: "CONTRACT",
                  args: [
                    {
                      prim: "lambda",
                      args: [
                        { prim: "unit" },
                        {
                          prim: "pair",
                          args: [
                            { prim: "list", args: [{ prim: "operation" }] },
                            { prim: "unit" }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  prim: "IF_NONE",
                  args: [
                    [{
                      prim: "PUSH",
                      args: [
                        { prim: "string" },
                        { string: `Contract does not exists` }
                      ]
                    }, { prim: "FAILWITH" }],
                    [{ prim: "DIP", args: [[{ prim: "DROP" }]] }]
                  ]
                },
                { prim: "PUSH", args: [{ prim: "mutez" }, { int: "0" }] }
              ]
            ]
          },
          { prim: "TRANSFER_TOKENS" },
          {
            prim: "DIP",
            args: [[{ prim: "NIL", args: [{ prim: "operation" }] }]]
          },
          { prim: "CONS" }
        ]
      ]
    },
    { prim: "CONS" },
    { prim: "DIP", args: [[{ prim: "UNIT" }]] },
    { prim: "PAIR" }
  ];
}
