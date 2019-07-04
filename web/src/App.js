import React, {useRef, useEffect, useState} from 'react';
import {Contract, Wavelet} from 'wavelet-client';
import {Box, Flex} from '@rebass/grid';
import JSBI from 'jsbi';

const BigInt = JSBI.BigInt;

const App = () => {
    const [host, setHost] = useState('https://testnet.perlin.net');
    const [privateKey, setPrivateKey] = useState(Buffer.from(Wavelet.generateNewWallet().secretKey, "binary").toString("hex"));
    const [client, setClient] = useState(undefined);
    const [node, setNodeInfo] = useState(undefined);
    const [contractAddress, setContractAddress] = useState('9f549686e464b2addfdcd5061deeeb7c622ea430c5f93ddaf5cf8a8f114f8b65');
    const [contract, setContract] = useState(undefined);
    const [message, setMessage] = useState('');
    const [chatLogs, setChatLogs] = useState([]);

    const [account, setAccount] = useState(undefined);

    const accountRef = useRef(account);
    useEffect(() => { accountRef.current = account }, [account]);

    const [sockets, setSockets] = useState({accounts: undefined, consensus: undefined});

    const socketsRef = useRef(sockets);
    useEffect(() => { socketsRef.current = sockets }, [sockets]);

    const reset = () => {
        setClient(undefined);
        setAccount(undefined);
        setNodeInfo(undefined);

        setContract(undefined);
        setContractAddress('');
        setMessage('');
        setChatLogs([]);

        const sockets = socketsRef.current;

        if (sockets.accounts) {
            sockets.accounts.close(1000, "connection closing normally");
        }

        if (sockets.consensus) {
            sockets.consensus.close(1000, "connection closing normally");
        }

        setSockets({accounts: undefined, consensus: undefined});
    };

    const connect = async () => {
        if (client === undefined) {
            try {
                const client = new Wavelet(host);
                setNodeInfo(await client.getNodeInfo());

                const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
                const walletAddress = Buffer.from(wallet.publicKey).toString("hex");
                setAccount(await client.getAccount(walletAddress));

                setClient(client);

                sockets.accounts = await client.pollAccounts({
                    onAccountUpdated: msgs => {
                        msgs.forEach(msg => {
                            switch (msg.event) {
                                case 'balance_updated': {
                                    setAccount({...accountRef.current, balance: msg.balance});
                                    break;
                                }
                                default: {
                                    break;
                                }
                            }
                        });
                    }
                }, {id: walletAddress});

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
        // Initialize
        const contract = new Contract(client, contractAddress);
        await contract.init();

        // Every single time consensus happens on Wavelet, query for the latest
        // chat logs by calling 'get_messages()' on the smart contract.

        sockets.consensus = await client.pollConsensus({
            onRoundEnded: _ => {
                if (contract === undefined) {
                    return;
                }

                (async () => {
                    await contract.fetchAndPopulateMemoryPages();
                    setChatLogs(contract.test('get_messages', BigInt(0)).logs);
                })();
            }
        });

        setSockets(sockets);

        setChatLogs(contract.test('get_messages', BigInt(0)).logs);
        setContract(contract);
    };

    const sendMessage = async () => {
        const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
        await contract.call(wallet, 'send_message', BigInt(0), BigInt(250000), {type: "string", value: message});

        setMessage("");
    };

    return (
        <>
            <Flex>
                <Box style={{textAlign: 'center'}} width={1}>
                <h2>A decentralized chat written in JavaScript + Rust (WebAssembly).</h2>
                </Box>
            </Flex>
            <Flex style={{marginTop: '-0.9em', marginBottom:'4em'}}>
                <Box style={{textAlign: 'center'}} width={1}>
                    Powered by <a href="https://wavelet.perlin.net">Wavelet</a>. Click <a href="https://medium.com/perlin-network/build-a-decentralized-chat-using-javascript-rust-webassembly-c775f8484b52">here</a> to learn how it works, and <a href="https://github.com/perlin-network/decentralized-chat">here</a> for the source code. Join our <a href="https://discord.gg/dMYfDPM">Discord</a> to get PERLs.
                </Box>

            </Flex>
            <Flex mb={2}>
                <Box width="200px">
                    <label>[secret]</label>
                </Box>
                <Box width={1}>
                    <input type="text" value={privateKey} disabled={client} data-lpignore="true"
                           onChange={evt => setPrivateKey(evt.target.value)}/>
                </Box>
            </Flex>

            <Flex mb={2}>
                <Box width="200px">
                    <label>[node]</label>
                </Box>
                <Box width={1}>
                    <Flex width={1}>
                        <Box width={9 / 12}>
                            <input type="text" value={host} disabled={client} data-lpignore="true"
                                   onKeyPress={async e => {
                                       if (e.key === 'Enter') {
                                           await connect()
                                       }
                                   }}
                                   onChange={evt => setHost(evt.target.value)}/>
                        </Box>
                        <Box width={3 / 12} style={{minWidth: '10em'}}>
                            <button style={{width: '100%', float: 'right'}} onClick={connect}
                                    disabled={privateKey.length !== 128}>{client ? 'Disconnect' : 'Connect'}</button>
                        </Box>
                    </Flex>
                </Box>
            </Flex>

            <Flex mb={4}>
                <Box width="200px">
                    <label>[contract]</label>
                </Box>
                <Box width={1}>
                    <Flex width={1}>
                        <Box width={9 / 12}>
                            <input type="text" value={contractAddress}
                                   placeholder="input chat smart contract address..." disabled={!client} data-lpignore="true"
                                   onKeyPress={async e => {
                                       if (e.key === 'Enter') await load()
                                   }}
                                   onChange={evt => setContractAddress(evt.target.value)}/>
                        </Box>
                        <Box width={3 / 12} style={{minWidth: '10em'}}>
                            <button style={{width: '100%', float: 'right'}}
                                    disabled={!client || contractAddress.length !== 64} onClick={load}>
                                Load Contract
                            </button>
                        </Box>
                    </Flex>
                </Box>
            </Flex>

            <Flex mb={2}>
                <Box width={155}>
                    <label>[node id]</label>
                </Box>
                <Box width={10 / 12}>
                    <span>{`${node && node.public_key ? node.public_key : "???"}`}</span>
                </Box>
            </Flex>

            <Flex mb={2}>
                <Box width={155}>
                    <label>[your id]</label>
                </Box>
                <Box width={10 / 12}>
                    <span>{`${account && account.public_key ? account.public_key : "???"}`}</span>
                </Box>
            </Flex>

            <Flex mb={4}>
                <Box width={155}>
                    <label>[balance]</label>
                </Box>
                <Box width={10 / 12}>
                    <span>{`${account && account.balance ? account.balance : 0} PERL(s)`}</span>
                </Box>
            </Flex>

            <Flex mb={3}>
                <Box width={2 / 4} pr={3}>
                    <textarea disabled={!client || !contract} value={message} placeholder="enter a message..." maxLength={240}
                              onKeyPress={e => {
                                  if (e.key === 'Enter') {
                                      if (account.balance >= 250000 && message.length > 0 && message.length <= 240) {
                                          sendMessage();
                                      } else {
                                          e.preventDefault();
                                      }
                                  }
                              }}
                              onChange={evt => setMessage(evt.target.value)} className='fw'/>
                </Box>
                <Box width={2 / 4}>
                    <button className='fw' style={{height: "100%", minWidth: "12.5em"}}
                            disabled={!client || !contract || !account || account.balance < 250000 || message.length === 0}
                            onClick={sendMessage}>Send Message [250,000 PERLs]
                    </button>
                </Box>
            </Flex>

            <Flex>
                <Box width={1}>
                <textarea disabled={!client || !contract} className='fw' style={{height: "100%"}} rows={40} readOnly
                          placeholder='no messages here so far chief...'
                          value={chatLogs.length === 1 ? chatLogs[0] : ''}/>
                </Box>
            </Flex>
        </>
    );
};

export default App;
