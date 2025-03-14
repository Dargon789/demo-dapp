import { AnimatePresence } from 'framer-motion'
import React, { useState, useEffect, useMemo, SetStateAction } from 'react'
import { ethers } from 'ethers'
import { sequence } from '0xsequence'
import { walletContracts } from '@0xsequence/abi'
import {
  Box,
  Image,
  Text,
  Button,
  ExternalLinkIcon,
  Divider,
  Card,
  TransactionIcon,
  Select,
  TokenImage,
  TextInput,
  Modal
} from '@0xsequence/design-system'
import { ETHAuth } from '@0xsequence/ethauth'
import { configureLogger } from '@0xsequence/utils'
import { ConnectOptions, OpenWalletIntent, Settings } from '@0xsequence/provider'
import { ChainId, NetworkType } from '@0xsequence/network'

import { ERC_20_ABI } from './constants/abi'
import { Console } from './components/Console'
import { Group } from './components/Group'
import { getDefaultChainId, toHexString } from './helpers'
import logoUrl from './images/logo.svg'
import skyweaverBannerUrl from './images/skyweaver-banner.png'
import skyweaverBannerLargeUrl from './images/skyweaver-banner-large.png'

configureLogger({ logLevel: 'DEBUG' })

interface Environment {
  name: string
  walletUrl: string
  projectAccessKey: string
}

const environments: Environment[] = [
  {
    name: 'production',
    walletUrl: 'https://sequence.app',
    projectAccessKey: 'AQAAAAAAAAbvrgpWEC2Aefg5qYStQmwjBpA'
  },
  {
    name: 'development',
    walletUrl: 'https://dev.sequence.app',
    //projectAccessKey: 'AQAAAAAAAAVBNfoB30kz7Ph4I_Qs5mkYuDc',
    projectAccessKey: 'AQAAAAAAAAVCXiQ9f_57R44MjorZ4SmGdhA'
  },
  {
    name: 'local',
    walletUrl: 'http://localhost:3333',
    projectAccessKey: 'AQAAAAAAAAVCXiQ9f_57R44MjorZ4SmGdhA'
  },
  {
    name: 'custom',
    walletUrl: '',
    projectAccessKey: ''
  }
]

const DEFAULT_API_URL = 'https://api.sequence.app'

// Specify your desired default chain id. NOTE: you can communicate to multiple
// chains at the same time without even having to switch the network, but a default
// chain is required.
const defaultChainId = getDefaultChainId() || ChainId.MAINNET
// const defaultChainId = ChainId.POLYGON
// const defaultChainId = ChainId.GOERLI
// const defaultChainId = ChainId.ARBITRUM
// const defaultChainId = ChainId.AVALANCHE
// etc.. see the full list here: https://docs.sequence.xyz/multi-chain-support

// For Sequence core dev team -- app developers can ignore
// a custom wallet app url can specified in the query string
const urlParams = new URLSearchParams(window.location.search)

const env = urlParams.get('env') ?? 'production'
const envConfig = environments.find(x => x.name === env)
const walletAppURL = urlParams.get('walletAppURL') ?? envConfig.walletUrl
const projectAccessKey = urlParams.get('projectAccessKey') ?? envConfig.projectAccessKey
const showProhibitedActions = urlParams.has('showProhibitedActions')

const isCustom = walletAppURL !== envConfig.walletUrl || projectAccessKey !== envConfig.projectAccessKey

if (walletAppURL && walletAppURL.length > 0) {
  // Wallet can point to a custom wallet app url
  // NOTICE: this is not needed, unless testing an alpha version of the wallet
  sequence.initWallet(projectAccessKey, { defaultNetwork: defaultChainId, transports: { walletAppURL } })
} else {
  // Init the sequence wallet library at the top-level of your project with
  // your designed default chain id
  sequence.initWallet(projectAccessKey, { defaultNetwork: defaultChainId, transports: { walletAppURL } })
}

// App component
const App = () => {
  const [consoleMsg, setConsoleMsg] = useState<null | string>(null)
  const [email, setEmail] = useState<null | string>(null)
  const [consoleLoading, setConsoleLoading] = useState<boolean>(false)
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false)

  const wallet = sequence.getWallet().getProvider()

  const [showChainId, setShowChainId] = useState<number>(wallet.getChainId())
  const [isOpen, toggleModal] = useState(false)
  const [warning, setWarning] = useState(false)

  useMemo(() => {
    wallet.on('chainChanged', (chainId: string) => {
      setShowChainId(Number(BigInt(chainId)))
    })
  }, [])

  useEffect(() => {
    setIsWalletConnected(wallet.isConnected())
  }, [wallet])

  useEffect(() => {
    consoleWelcomeMessage()
    // eslint-disable-next-line
  }, [isWalletConnected])

  useEffect(() => {
    // Wallet events
    wallet.client.onOpen(() => {
      console.log('wallet window opened')
    })

    wallet.client.onClose(() => {
      console.log('wallet window closed')
    })
  }, [wallet])

  const defaultConnectOptions: ConnectOptions = {
    app: 'Demo Dapp',
    askForEmail: true
    // keepWalletOpened: true,
  }

  // Methods
  const connect = async (connectOptions: ConnectOptions = { app: 'Demo dapp' }) => {
    if (isWalletConnected) {
      resetConsole()
      appendConsoleLine('Wallet already connected!')
      setConsoleLoading(false)
      return
    }

    connectOptions = {
      ...defaultConnectOptions,
      ...connectOptions,
      settings: {
        ...defaultConnectOptions.settings,
        ...connectOptions.settings
      }
    }

    try {
      resetConsole()
      appendConsoleLine('Connecting')
      const wallet = sequence.getWallet()

      const connectDetails = await wallet.connect(connectOptions)

      // Example of how to verify using ETHAuth via Sequence API
      if (connectOptions.authorize && connectDetails.connected) {
        let apiUrl = urlParams.get('apiUrl')

        if (!apiUrl || apiUrl.length === 0) {
          apiUrl = DEFAULT_API_URL
        }

        const api = new sequence.api.SequenceAPIClient(apiUrl)
        // or just
        // const api = new sequence.api.SequenceAPIClient('https://api.sequence.app')

        const { isValid } = await api.isValidETHAuthProof({
          chainId: connectDetails.chainId,
          walletAddress: connectDetails.session.accountAddress,
          ethAuthProofString: connectDetails.proof!.proofString
        })

        appendConsoleLine(`isValid (API)?: ${isValid}`)
      }

      // Example of how to verify using ETHAuth directl on the client
      if (connectOptions.authorize) {
        const ethAuth = new ETHAuth()

        if (connectDetails.proof) {
          const decodedProof = await ethAuth.decodeProof(connectDetails.proof.proofString, true)

          const isValid = await wallet.utils.isValidTypedDataSignature(
            wallet.getAddress(),
            connectDetails.proof.typedData,
            decodedProof.signature,
            Number(BigInt(connectDetails.chainId))
          )

          appendConsoleLine(`connected using chainId: ${BigInt(connectDetails.chainId).toString()}`)
          appendConsoleLine(`isValid (client)?: ${isValid}`)
        }
      }

      setConsoleLoading(false)
      if (connectDetails.connected) {
        appendConsoleLine('Wallet connected!')
        appendConsoleLine(`shared email: ${connectDetails.email}`)
        setIsWalletConnected(true)
      } else {
        appendConsoleLine('Failed to connect wallet - ' + connectDetails.error)
      }
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const disconnect = () => {
    const wallet = sequence.getWallet()
    wallet.disconnect()
    consoleWelcomeMessage()
    setIsWalletConnected(false)
  }

  const openWallet = () => {
    const wallet = sequence.getWallet()
    wallet.openWallet()
  }

  const openWalletWithSettings = () => {
    const wallet = sequence.getWallet()

    const settings: Settings = {
      theme: 'light',
      includedPaymentProviders: ['moonpay', 'ramp'],
      defaultFundingCurrency: 'eth',
      defaultPurchaseAmount: 400,
      lockFundingCurrencyToDefault: false
    }

    const intent: OpenWalletIntent = {
      type: 'openWithOptions',
      options: {
        app: 'Demo Dapp',
        settings
      }
    }

    const path = 'wallet/add-funds'
    wallet.openWallet(path, intent)
  }

  const closeWallet = () => {
    const wallet = sequence.getWallet()
    wallet.closeWallet()
  }

  const isConnected = async () => {
    resetConsole()
    const wallet = sequence.getWallet()
    appendConsoleLine(`isConnected?: ${wallet.isConnected()}`)
    setConsoleLoading(false)
  }

  const isOpened = async () => {
    resetConsole()
    const wallet = sequence.getWallet()
    appendConsoleLine(`isOpened?: ${wallet.isOpened()}`)
    setConsoleLoading(false)
  }

  const getChainID = async () => {
    try {
      resetConsole()

      const topChainId = wallet.getChainId()
      appendConsoleLine(`top chainId: ${topChainId}`)

      const provider = wallet.getProvider()
      const providerChainId = provider!.getChainId()
      appendConsoleLine(`provider.getChainId(): ${providerChainId}`)

      const signer = wallet.getSigner()
      const signerChainId = await signer.getChainId()
      appendConsoleLine(`signer.getChainId(): ${signerChainId}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const getAccounts = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()
      const address = wallet.getAddress()
      appendConsoleLine(`getAddress(): ${address}`)

      const provider = wallet.getProvider()
      const accountList = provider.listAccounts()
      appendConsoleLine(`accounts: ${JSON.stringify(accountList)}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const getBalance = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      const provider = wallet.getProvider()
      const account = wallet.getAddress()
      const balanceChk1 = await provider!.getBalance(account)
      appendConsoleLine(`balance check 1: ${balanceChk1.toString()}`)

      const signer = wallet.getSigner()
      const balanceChk2 = await signer.getBalance()
      appendConsoleLine(`balance check 2: ${balanceChk2.toString()}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const getNetworks = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()
      const networks = await wallet.getNetworks()

      appendConsoleLine(`networks: ${JSON.stringify(networks, null, 2)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const signMessageString = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      appendConsoleLine('signing message...')
      const signer = wallet.getSigner()

      const message = `1915 Robert Frost
The Road Not Taken

Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth

Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear
Though as for that the passing there
Had worn them really about the same,

And both that morning equally lay
In leaves no step had trodden black.
Oh, I kept the first for another day!
Yet knowing how way leads on to way,
I doubted if I should ever come back.

I shall be telling this with a sigh
Somewhere ages and ages hence:
Two roads diverged in a wood, and I—
I took the one less traveled by,
And that has made all the difference.

\u2601 \u2600 \u2602`

      // sign
      const sig = await signer.signMessage(message)
      appendConsoleLine(`signature: ${sig}`)

      const isValid = await wallet.utils.isValidMessageSignature(wallet.getAddress(), message, sig, await signer.getChainId())
      appendConsoleLine(`isValid?: ${isValid}`)
      if (!isValid) throw new Error('sig invalid')

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const signMessageHex = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      appendConsoleLine('signing message...')
      const signer = wallet.getSigner()

      // Message in hex
      const message = ethers.hexlify(ethers.toUtf8Bytes('Hello, world!'))

      // sign
      const sig = await signer.signMessage(message)
      appendConsoleLine(`signature: ${sig}`)

      const isValid = await wallet.utils.isValidMessageSignature(wallet.getAddress(), message, sig, await signer.getChainId())
      appendConsoleLine(`isValid?: ${isValid}`)
      if (!isValid) throw new Error('sig invalid')

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const signMessageBytes = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      appendConsoleLine('signing message...')
      const signer = wallet.getSigner()

      // Message in hex
      const message = ethers.toUtf8Bytes('Hello, world!')

      // sign
      const sig = await signer.signMessage(message)
      appendConsoleLine(`signature: ${sig}`)

      const isValid = await wallet.utils.isValidMessageSignature(wallet.getAddress(), message, sig, await signer.getChainId())
      appendConsoleLine(`isValid?: ${isValid}`)
      if (!isValid) throw new Error('sig invalid')

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const signTypedData = async () => {
    try {
      resetConsole()
      const wallet = sequence.getWallet()

      appendConsoleLine('signing typedData...')

      const typedData: sequence.utils.TypedData = {
        types: {
          Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' }
          ],
          Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'cc', type: 'Person[]' },
            { name: 'contents', type: 'string' },
            { name: 'attachements', type: 'string[]' }
          ]
        },
        primaryType: 'Mail',
        domain: {
          name: 'Ether Mail',
          version: '1',
          chainId: 1,
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
        },
        message: {
          from: {
            name: 'Cow',
            wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
          },
          to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
          },
          cc: [
            { name: 'Dev Team', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
            { name: 'Accounting', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' }
          ],
          contents: 'Hello, Bob!',
          attachements: ['cat.png', 'dog.png']
        }
      }

      const signer = wallet.getSigner()

      const sig = await signer.signTypedData(typedData.domain, typedData.types, typedData.message)
      appendConsoleLine(`signature: ${sig}`)

      // validate
      const isValid = await wallet.utils.isValidTypedDataSignature(wallet.getAddress(), typedData, sig, await signer.getChainId())
      appendConsoleLine(`isValid?: ${isValid}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const estimateUnwrapGas = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      const wmaticContractAddress = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
      const wmaticInterface = new ethers.Interface(['function withdraw(uint256 amount)'])

      const tx: sequence.transactions.Transaction = {
        to: wmaticContractAddress,
        data: wmaticInterface.encodeFunctionData('withdraw', ['1000000000000000000'])
      }

      const provider = wallet.getProvider()
      const estimate = await provider.estimateGas(tx)

      appendConsoleLine(`estimated gas needed for wmatic withdrawal : ${estimate.toString()}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const sendETH = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()
      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner()

      appendConsoleLine(`Transfer txn on ${signer.getChainId()} chainId`)

      // NOTE: on mainnet, the balance will be of ETH value
      // and on matic, the balance will be of MATIC value

      // Sending the funds to the wallet itself
      // so we don't lose any funds ;-)
      // (of course, you can send anywhere)
      const toAddress = await signer.getAddress()

      const tx1: sequence.transactions.Transaction = {
        delegateCall: false,
        revertOnError: false,
        gasLimit: '0x55555',
        to: toAddress,
        value: ethers.parseEther('1.234'),
        data: '0x'
      }

      const tx2: sequence.transactions.Transaction = {
        delegateCall: false,
        revertOnError: false,
        gasLimit: '0x55555',
        to: toAddress,
        value: ethers.parseEther('0.4242'),
        data: '0x'
      }

      const provider = signer.provider

      const balance1 = await provider.getBalance(toAddress)
      appendConsoleLine(`balance of ${toAddress}, before: ${balance1}`)

      const txnResp = await signer.sendTransaction([tx1, tx2])
      appendConsoleLine(`txnResponse: ${JSON.stringify(txnResp)}`)

      const balance2 = await provider.getBalance(toAddress)
      appendConsoleLine(`balance of ${toAddress}, after: ${balance2}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const sendSepoliaUSDC = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      // Sending the funds to the wallet itself
      // so we don't lose any funds ;-)
      // (of course, you can send anywhere)
      const toAddress = await signer.getAddress()

      const amount = ethers.parseUnits('1', 1)

      // (USDC address on Sepolia)
      const usdcAddress = '0x07865c6e87b9f70255377e024ace6630c1eaa37f'

      const tx: sequence.transactions.Transaction = {
        delegateCall: false,
        revertOnError: false,
        gasLimit: '0x55555',
        to: usdcAddress,
        value: 0,
        data: new ethers.Interface(ERC_20_ABI).encodeFunctionData('transfer', [toAddress, toHexString(amount)])
      }

      const txnResp = await signer.sendTransaction([tx], { chainId: ChainId.SEPOLIA })
      appendConsoleLine(`txnResponse: ${JSON.stringify(txnResp)}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const sendDAI = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      // Sending the funds to the wallet itself
      // so we don't lose any funds ;-)
      // (of course, you can send anywhere)
      const toAddress = await signer.getAddress()

      const amount = ethers.parseUnits('0.05', 18)
      const daiContractAddress = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' // (DAI address on Polygon)

      const tx: sequence.transactions.Transaction = {
        delegateCall: false,
        revertOnError: false,
        gasLimit: '0x55555',
        to: daiContractAddress,
        value: 0,
        data: new ethers.Interface(ERC_20_ABI).encodeFunctionData('transfer', [toAddress, toHexString(amount)])
      }

      const txnResp = await signer.sendTransaction([tx])
      appendConsoleLine(`txnResponse: ${JSON.stringify(txnResp)}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const sendETHSidechain = async () => {
    try {
      const wallet = sequence.getWallet()

      // Send either to Arbitrum or Optimism
      // just pick one that is not the current chainId
      const pick = wallet.getChainId() === ChainId.ARBITRUM ? ChainId.OPTIMISM : ChainId.ARBITRUM
      sendETH(wallet.getSigner(pick))
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const send1155Tokens = async () => {
    try {
      resetConsole()
      appendConsoleLine('TODO')
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const contractExample = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner()

      const abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function transfer(address to, uint amount) returns (bool)',
        'event Transfer(address indexed from, address indexed to, uint amount)'
      ]

      // USD Coin (PoS) on Polygon
      const address = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'

      const usdc = new ethers.Contract(address, abi)

      const usdSymbol = await usdc.symbol()
      appendConsoleLine(`Token symbol: ${usdSymbol}`)

      const balance = await usdc.balanceOf(await signer.getAddress())
      appendConsoleLine(`Token Balance: ${balance.toString()}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const fetchTokenBalances = async () => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      const signer = wallet.getSigner()
      const accountAddress = await signer.getAddress()
      const networks = await wallet.getNetworks()
      const network = networks.find(network => network.chainId === ChainId.POLYGON)

      if (!network) {
        throw new Error(`Could not find Polygon network in networks list`)
      }

      const indexer = new sequence.indexer.SequenceIndexer(network.indexerUrl)

      const tokenBalances = await indexer.getTokenBalances({
        accountAddress: accountAddress,
        includeMetadata: true
      })

      appendConsoleLine(`tokens in your account: ${JSON.stringify(tokenBalances)}`)

      // NOTE: you can put any NFT/collectible address in the `contractAddress` field and it will return all of the balances + metadata.
      // We use the Skyweaver production contract address here for demo purposes, but try another one :)
      const skyweaverCollectibles = await indexer.getTokenBalances({
        accountAddress: accountAddress,
        includeMetadata: true,
        contractAddress: '0x631998e91476DA5B870D741192fc5Cbc55F5a52E'
      })
      appendConsoleLine(`skyweaver collectibles in your account: ${JSON.stringify(skyweaverCollectibles)}`)

      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const updateImplementation = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      const transaction: sequence.transactions.Transaction = {
        to: wallet.getAddress(),
        data: new ethers.Interface(walletContracts.mainModule.abi).encodeFunctionData('updateImplementation', [
          ethers.ZeroAddress
        ])
      }

      const response = await signer.sendTransaction(transaction)
      appendConsoleLine(`response: ${JSON.stringify(response)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const updateImageHash = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      const transaction: sequence.transactions.Transaction = {
        to: wallet.getAddress(),
        data: new ethers.Interface(walletContracts.mainModuleUpgradable.abi).encodeFunctionData('updateImageHash', [
          ethers.ZeroHash
        ])
      }

      const response = await signer.sendTransaction(transaction)
      appendConsoleLine(`response: ${JSON.stringify(response)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const delegateCall = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      const transaction: sequence.transactions.Transaction = {
        to: wallet.getAddress(),
        delegateCall: true
      }

      const response = await signer.sendTransaction(transaction)
      appendConsoleLine(`response: ${JSON.stringify(response)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const addHook = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      const transaction: sequence.transactions.Transaction = {
        to: wallet.getAddress(),
        data: new ethers.Interface(['function addHook(bytes4 _signature, address _implementation)']).encodeFunctionData(
          'addHook',
          ['0x01234567', ethers.ZeroAddress]
        )
      }

      const response = await signer.sendTransaction(transaction)
      appendConsoleLine(`response: ${JSON.stringify(response)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const setExtraImageHash = async (signer?: sequence.provider.SequenceSigner) => {
    try {
      resetConsole()

      const wallet = sequence.getWallet()

      signer = signer || wallet.getSigner() // select DefaultChain signer by default

      const transaction: sequence.transactions.Transaction = {
        to: wallet.getAddress(),
        data: new ethers.Interface(['function setExtraImageHash(bytes32 _imageHash, uint256 _expiration)']).encodeFunctionData(
          'setExtraImageHash',
          [ethers.ZeroHash, ethers.MaxUint256]
        )
      }

      const response = await signer.sendTransaction(transaction)
      appendConsoleLine(`response: ${JSON.stringify(response)}`)
      setConsoleLoading(false)
    } catch (e) {
      console.error(e)
      consoleErrorMessage()
    }
  }

  const appendConsoleLine = (message: string, clear = false) => {
    console.log(message)

    if (clear) {
      return setConsoleMsg(message)
    }

    return setConsoleMsg(prevState => {
      return `${prevState}\n\n${message}`
    })
  }

  const resetConsole = () => {
    setConsoleLoading(true)
  }

  const consoleWelcomeMessage = () => {
    setConsoleLoading(false)

    if (isWalletConnected) {
      setConsoleMsg('Status: Wallet is connected :)')
    } else {
      setConsoleMsg('Status: Wallet not connected. Please connect wallet first.')
    }
  }

  const consoleErrorMessage = () => {
    setConsoleLoading(false)
    setConsoleMsg('An error occurred')
  }

  // networks list, filtered and sorted
  const omitNetworks = [
    ChainId.RINKEBY,
    ChainId.HARDHAT,
    ChainId.HARDHAT_2,
    ChainId.KOVAN,
    ChainId.ROPSTEN,
    ChainId.HOMEVERSE_TESTNET,
    ChainId.BASE_GOERLI
  ]

  const mainnets = Object.values(sequence.network.networks)
    .filter(network => network.type === NetworkType.MAINNET)
    .sort((a, b) => a.chainId - b.chainId)
  const testnets = Object.values(sequence.network.networks)
    .filter(network => network.type === NetworkType.TESTNET)
    .sort((a, b) => a.chainId - b.chainId)
  const networks = [...mainnets, ...testnets].filter(network => !network.deprecated && !omitNetworks.includes(network.chainId))

  useEffect(() => {
    if (email && !isOpen) {
      console.log(email)
      connect({
        app: 'Demo Dapp',
        authorize: true,
        settings: {
          // Specify signInWithEmail with an email address to allow user automatically sign in with the email option.
          signInWithEmail: email,
          theme: 'dark',
          bannerUrl: `${window.location.origin}${skyweaverBannerUrl}`
        }
      })
      setEmail(null)
    }
  }, [email, isOpen])

  const sanitizeEmail = (email: string) => {
    // Trim unnecessary spaces
    email = email.trim()

    // Check if the email matches the pattern of a typical email
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
    if (emailRegex.test(email)) {
      return true
    }

    return false
  }

  return (
    <Box marginY="0" marginX="auto" paddingX="6" style={{ maxWidth: '720px', marginTop: '80px', marginBottom: '80px' }}>
      <Box marginBottom="10">
        <a href="https://sequence.xyz/" target="_blank" rel="noopener">
          <Image height="6" alt="logo" src={logoUrl} />
        </a>
      </Box>

      <Box>
        <Text variant="normal" color="text100" fontWeight="bold">
          Demo Dapp
        </Text>
      </Box>

      <Box marginTop="1" marginBottom="4">
        <Text variant="normal" color="text80">
          A dapp example on how to use the Sequence Wallet. This covers how to connect, sign messages and send transctions.
        </Text>
      </Box>

      <Card background="backgroundMuted" alignItems="center" gap="3">
        <TransactionIcon />
        <Text variant="normal" color="text80">
          Please open your browser dev inspector to view output of functions below.
        </Text>
      </Card>

      <Divider background="buttonGlass" />

      {!isCustom && (
        <Box marginBottom="4">
          <Select
            name="environment"
            label={'Environment'}
            labelLocation="top"
            onValueChange={value => {
              // Disconnect the wallet
              disconnect()

              // Set the new env url param
              urlParams.set('env', value)

              // Clear any existing walletAppURL overrides
              urlParams.delete('walletAppURL')

              // Update the url with the new params and refresh the page
              window.location.search = urlParams.toString()
            }}
            value={env}
            options={[
              ...Object.values(environments).map(env => ({
                label: (
                  <Box alignItems="center" gap="2">
                    <Text capitalize>{env.name}</Text>
                  </Box>
                ),
                value: String(env.name)
              }))
            ]}
          />
        </Box>
      )}

      <Box marginBottom="4">
        <Text as="div" variant="small" color="text100">
          Wallet URL
        </Text>

        <Box
          as="a"
          href={walletAppURL}
          target="_blank"
          rel="noopener"
          textDecoration="none"
          gap="1"
          marginTop="1"
          alignItems="center"
          color="text80"
        >
          <Text as="div" variant="normal" color="text80">
            {walletAppURL}
          </Text>
          <ExternalLinkIcon />
        </Box>
      </Box>

      <Divider background="buttonGlass" />

      <Box marginBottom="4">
        <Text as="div" variant="small" color="text100">
          Project Access Key
        </Text>

        <Box
          as="a"
          href={walletAppURL}
          target="_blank"
          rel="noopener"
          textDecoration="none"
          gap="1"
          marginTop="1"
          alignItems="center"
          color="text80"
        >
          <Text as="div" variant="normal" color="text80">
            {projectAccessKey}
          </Text>
        </Box>
      </Box>

      <Divider background="buttonGlass" />

      <Box marginBottom="4">
        <Select
          name="chainId"
          label={'Network'}
          labelLocation="top"
          onValueChange={value => wallet.setDefaultChainId(Number(value))}
          value={String(showChainId)}
          options={[
            ...Object.values(networks).map(network => ({
              label: (
                <Box alignItems="center" gap="2">
                  <TokenImage src={network.logoURI} size="sm" />
                  <Text>{network.title!}</Text>
                </Box>
              ),
              value: String(network.chainId)
            }))
          ]}
        />
      </Box>

      <Group label="Connection">
        <Button width="full" shape="square" onClick={() => connect()} label="Connect" />
        <Button
          width="full"
          shape="square"
          onClick={() => connect({ app: 'Demo Dapp', authorize: true })}
          label="Connect & Auth"
        />
        <Button
          width="full"
          shape="square"
          onClick={() =>
            connect({
              app: 'Demo Dapp',
              authorize: true,
              settings: {
                // Specify signInOptions to pick the available sign in options.
                // signInOptions: ['email', 'google', 'apple'],
                theme: 'dark',
                bannerUrl: `${window.location.origin}${skyweaverBannerLargeUrl}`,
                bannerSize: 'medium',
                includedPaymentProviders: ['moonpay'],
                defaultFundingCurrency: 'matic',
                defaultPurchaseAmount: 111
              }
            })
          }
          label="Connect with Settings"
        />
        <Button
          width="full"
          shape="square"
          onClick={() => {
            toggleModal(true)
          }}
          label="Connect with Email"
        />
        <Button
          width="full"
          shape="square"
          onClick={() => {
            connect({
              app: 'Demo Dapp',
              authorize: true,
              settings: {
                // Specify signInWithEmail with an email address to allow user automatically sign in with the email option.
                signInWith: 'google',
                theme: 'dark',
                bannerUrl: `${window.location.origin}${skyweaverBannerUrl}`
              }
            })
          }}
          label="Connect with Google"
        />

        <Button width="full" shape="square" onClick={() => disconnect()} label="Disconnect" />
      </Group>

      <Group label="Basics">
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => openWallet()} label="Open Wallet" />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => openWalletWithSettings()}
          label="Open Wallet with Settings"
        />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => closeWallet()} label="Close Wallet" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => isConnected()} label="Is Connected?" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => isOpened()} label="Is Opened?" />
      </Group>

      <Group label="State">
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => getChainID()} label="ChainID" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => getNetworks()} label="Networks" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => getAccounts()} label="Get Accounts" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => getBalance()} label="Get Balance" />
      </Group>

      <Group label="Signing">
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => signMessageString()}
          label="Sign Message"
        />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => signMessageHex()}
          label="Sign Message (Hex)"
        />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => signMessageBytes()}
          label="Sign Message (Bytes)"
        />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => signTypedData()}
          label="Sign TypedData"
        />
      </Group>

      <Group label="Simulation">
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => estimateUnwrapGas()}
          label="Estimate Unwrap Gas"
        />
      </Group>

      <Group label="Transactions">
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => sendETH()} label="Send funds" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => sendETHSidechain()} label="Send on L2" />
        <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => sendDAI()} label="Send DAI" />
        <Button
          width="full"
          shape="square"
          // TODO: Implement send ERC-1155 example
          disabled={!isWalletConnected || true}
          onClick={() => send1155Tokens()}
          label="Send ERC-1155 Tokens"
        />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => sendSepoliaUSDC()}
          label="Send USDC on Sepolia"
        />
      </Group>

      <Group label="Various">
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => contractExample()}
          label="Read Symbol and Balance"
        />
        <Button
          width="full"
          shape="square"
          disabled={!isWalletConnected}
          onClick={() => fetchTokenBalances()}
          label="Fetch Token Balances"
        />
      </Group>

      {showProhibitedActions && (
        <Group label="Prohibited Actions - FOR TESTING ONLY! DO NOT CONFIRM!">
          <Button
            width="full"
            shape="square"
            disabled={!isWalletConnected}
            onClick={() => updateImplementation()}
            label="Update Implementation"
          />
          <Button
            width="full"
            shape="square"
            disabled={!isWalletConnected}
            onClick={() => updateImageHash()}
            label="Update Image Hash"
          />
          <Button
            width="full"
            shape="square"
            disabled={!isWalletConnected}
            onClick={() => delegateCall()}
            label="Delegate Call"
          />
          <Button width="full" shape="square" disabled={!isWalletConnected} onClick={() => addHook()} label="Add Hook" />
          <Button
            width="full"
            shape="square"
            disabled={!isWalletConnected}
            onClick={() => setExtraImageHash()}
            label="Set Extra Image Hash"
          />
        </Group>
      )}

      <AnimatePresence>
        {isOpen && (
          <Modal onClose={() => toggleModal(false)} size={'sm'}>
            <Box flexDirection="column" justifyContent="space-between" height="full" padding="16">
              <Box flexDirection="column">
                <Box marginTop="6">
                  <Text marginTop="5" variant="normal" color="text80">
                    Auto-email login, please specify the email address
                  </Text>
                </Box>
                <Box marginTop="4">
                  <TextInput
                    onChange={(ev: { target: { value: SetStateAction<string> } }) => {
                      setEmail(ev.target.value)
                    }}
                  ></TextInput>
                </Box>
                {warning ? (
                  <Box marginTop="6">
                    <Text marginTop="5" variant="normal" color="warning">
                      please input an email with correct format
                    </Text>
                  </Box>
                ) : null}
                <Box gap="2" marginY="4">
                  <Button
                    variant="primary"
                    label="Login"
                    onClick={() => {
                      if (sanitizeEmail(email)) {
                        setWarning(false)
                        toggleModal(false)
                      } else {
                        setWarning(true)
                      }
                    }}
                    data-id="login"
                  />
                </Box>
              </Box>
            </Box>
          </Modal>
        )}
      </AnimatePresence>
      <Console message={consoleMsg} loading={consoleLoading} />
    </Box>
  )
}

export default React.memo(App)
