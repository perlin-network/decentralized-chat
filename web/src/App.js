import React, {useEffect, useRef, useState} from 'react';
import {Contract, Wavelet} from 'wavelet-client';
import {FaucetButton} from "wavelet-faucet";
import {themes} from "wavelet-faucet"
import {Box, Flex} from '@rebass/grid';
import JSBI from 'jsbi';

const BigInt = JSBI.BigInt;

const App = () => {
    const [host, setHost] = useState('https://testnet.perlin.net');
    const [privateKey, setPrivateKey] = useState(
        Buffer.from(Wavelet.generateNewWallet().secretKey, 'binary').toString('hex')
    );
    const [client, setClient] = useState(undefined);
    const [node, setNodeInfo] = useState(undefined);
    const [contractAddress, setContractAddress] = useState(
        '6845582020708e2ed658e25628b2a79f976e47191002f42fe9e7e90be69373f3'
    );
    const [contract, setContract] = useState(undefined);
    const [message, setMessage] = useState('');
    const [chatLogs, setChatLogs] = useState([]);

    const [account, setAccount] = useState(undefined);
    const [contractAccount, setContractAccount] = useState(undefined);

    const accountRef = useRef(account);
    const contractAccountRef = useRef(contractAccount);

    useEffect(() => {
        accountRef.current = account;
    }, [account]);

    useEffect(() => {
        contractAccountRef.current = contractAccount;
    }, [contractAccount])

    const [sockets, setSockets] = useState({
        accounts: undefined,
        contract: undefined,
        consensus: undefined
    });

    const socketsRef = useRef(sockets);
    useEffect(() => {
        socketsRef.current = sockets;
    }, [sockets]);

    const reset = () => {
        setClient(undefined);
        setAccount(undefined);
        setContractAccount(undefined);
        setNodeInfo(undefined);

        setContract(undefined);
        setContractAddress('');
        setMessage('');
        setChatLogs([]);

        const sockets = socketsRef.current;

        if (sockets.accounts) {
            sockets.accounts.close(1000, 'connection closing normally');
        }

        if (sockets.contract) {
            sockets.contract.close(1000, 'connection closing normally');
        }

        if (sockets.consensus) {
            sockets.consensus.close(1000, 'connection closing normally');
        }

        setSockets({accounts: undefined, consensus: undefined});
    };

    const connect = async () => {
        if (client === undefined) {
            try {
                const client = new Wavelet(host);
                setNodeInfo(await client.getNodeInfo());

                const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
                const walletAddress = Buffer.from(wallet.publicKey).toString('hex');
                setAccount(await client.getAccount(walletAddress));

                setClient(client);

                sockets.accounts = await client.pollAccounts(
                    {
                        onAccountUpdated: msg => {
                            switch (msg.event) {
                                case 'balance_updated': {
                                    setAccount({...accountRef.current, balance: msg.balance});
                                    break;
                                }
                                default: {
                                    break;
                                }
                            }
                        }
                    },
                    {id: walletAddress}
                );

                setSockets(sockets);
            } catch (error) {
                reset();
                alert(error);
            }
        } else {
            reset();
        }
    };

    const load = async () => {
        setContractAccount(await client.getAccount(contractAddress));

        // Initialize
        const contract = new Contract(client, contractAddress);
        await contract.init();

        const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);

        // Every single time consensus happens on Wavelet, query for the latest
        // chat logs by calling 'get_messages()' on the smart contract.

        sockets.consensus = await client.pollConsensus({
            onRoundEnded: _ => {
                if (contract === undefined) {
                    return;
                }

                (async () => {
                    await contract.fetchAndPopulateMemoryPages();
                    setChatLogs(contract.test(wallet, 'get_messages', BigInt(0)).logs);
                })();
            }
        });

        sockets.contract = await client.pollAccounts(
            {
                onAccountUpdated: msg => {
                    switch (msg.event) {
                        case 'gas_balance_updated': {
                            setContractAccount({...contractAccountRef.current, gas_balance: msg.gas_balance});
                            break;
                        }
                        default: {
                            break;
                        }
                    }
                }
            },
            {id: contractAddress}
        );

        setSockets(sockets);

        setChatLogs(contract.test(wallet, 'get_messages', BigInt(0)).logs);
        setContract(contract);
    };

    const sendMessage = async () => {
        const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
        await contract.call(wallet, 'send_message', BigInt(0), BigInt(250000), BigInt(0), {
            type: 'string',
            value: message
        });

        setMessage('');
    };

    return (
        <>
            <h2 className="text-center title">
                A decentralized chat written in JavaScript + Rust (WebAssembly).
            </h2>
            <Box className="text-center" mb={4}>
                Powered by <a href="https://wavelet.perlin.net">Wavelet</a>. Click{' '}
                <a href="https://medium.com/perlin-network/build-a-decentralized-chat-using-javascript-rust-webassembly-c775f8484b52">here</a> to
                learn how it works, and{' '}
                <a href="https://github.com/perlin-network/decentralized-chat">here</a>{' '}
                for the source code. Join our{' '}
                <a href="https://discord.gg/dMYfDPM">Discord</a> to get PERLs.
            </Box>
            <Flex mb={2} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[secret]</label>
                </Box>
                <Box flex="1">
                    <input
                        type="text"
                        value={privateKey}
                        disabled={client}
                        data-lpignore="true"
                        onChange={evt => setPrivateKey(evt.target.value)}
                    />
                </Box>
            </Flex>

            <Flex mb={2} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[node]</label>
                </Box>
                <Box flex="1">
                    <Flex width={1}>
                        <Box width={9 / 12}>
                            <input
                                type="text"
                                value={host}
                                disabled={client}
                                data-lpignore="true"
                                onKeyPress={async e => {
                                    if (e.key === 'Enter') {
                                        await connect();
                                    }
                                }}
                                onChange={evt => setHost(evt.target.value)}
                            />
                        </Box>
                        <Box width={3 / 12} style={{minWidth: '10em'}} ml={2}>
                            <button
                                style={{width: '100%'}}
                                onClick={connect}
                                disabled={privateKey.length !== 128}
                            >
                                {client ? 'Disconnect' : 'Connect'}
                            </button>
                        </Box>
                    </Flex>
                </Box>
            </Flex>

            <Flex mb={4} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[contract]</label>
                </Box>
                <Box flex="1">
                    <Flex width={1}>
                        <Box width={9 / 12}>
                            <input
                                type="text"
                                value={contractAddress}
                                placeholder="input chat smart contract address..."
                                disabled={!client}
                                data-lpignore="true"
                                onKeyPress={async e => {
                                    if (e.key === 'Enter') await load();
                                }}
                                onChange={evt => setContractAddress(evt.target.value)}
                            />
                        </Box>
                        <Box width={3 / 12} style={{minWidth: '10em'}} ml={2}>
                            <button
                                style={{width: "100%"}}
                                disabled={!client || contractAddress.length !== 64}
                                onClick={load}
                            >
                                Load Contract
                            </button>
                        </Box>
                    </Flex>
                </Box>
            </Flex>

            <FaucetButton modalHeader theme={themes.mono} style={{position: 'fixed', right: '100px', bottom: '0px'}} address={account && account.public_key}/>

            <Flex mb={2} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[node id]</label>
                </Box>
                <Box flex="1" style={{minWidth: 0}}>
          <span
              className="truncate"
              title={`${node && node.public_key ? node.public_key : '???'}`}
          >{`${node && node.public_key ? node.public_key : '???'}`}</span>
                </Box>
            </Flex>

            <Flex mb={2} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[your id]</label>
                </Box>
                <Box flex="1" style={{minWidth: 0}}>
          <span
              className="truncate"
              title={`${
                  account && account.public_key ? account.public_key : '???'
                  }`}
          >{`${
              account && account.public_key ? account.public_key : '???'
              }`}</span>
                </Box>
            </Flex>

            <Flex mb={2} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[your balance]</label>
                </Box>
                <Box flex="1">
          <span>{`${
              account && account.balance ? account.balance : 0
              } PERL(s)`}</span>
                </Box>
            </Flex>

            <Flex mb={4} alignItems="center">
                <Box flex="0 0 150px">
                    <label>[contract gas balance]</label>
                </Box>
                <Box flex="1">
          <span>{`${
              contractAccount && contractAccount.gas_balance ? contractAccount.gas_balance : 0
              } PERL(s)`}</span>
                </Box>
            </Flex>

            <Flex mb={3}>
                <Box flex="1" pr={2}>
          <textarea
              disabled={!client || !contract}
              value={message}
              placeholder="enter a message..."
              maxLength={240}
              onKeyPress={e => {
                  if (e.key === 'Enter') {
                      if (
                          account.balance > 2 &&
                          contractAccount.gas_balance + account.balance >= 250000 &&
                          message.length > 0 &&
                          message.length <= 240
                      ) {
                          sendMessage();
                      } else {
                          e.preventDefault();
                      }
                  }
              }}
              onChange={evt => setMessage(evt.target.value)}
              className="fw"
          />
                </Box>
                <Box flex="0 0 220px">
                    <button
                        className="fw"
                        style={{height: "98%"}}
                        disabled={
                            !client ||
                            !contract ||
                            !account ||
                            account.balance < 2 ||
                            contractAccount.gas_balance + account.balance < 250000 ||
                            message.length === 0
                        }
                        onClick={sendMessage}
                    >
                        Send Message [2 PERLs]
                    </button>
                </Box>
            </Flex>

            <textarea
                disabled={!client || !contract}
                className="fw"
                rows={35}
                readOnly
                placeholder="no messages here so far chief..."
                value={chatLogs.length === 1 ? chatLogs[0] : ''}
            />
        </>
    );
};

export default App;
