const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const bip39 = require('bip39');
const generate = require('random-words');

const loadConfig = () => {
  let config = {};
  if (fs.existsSync('config.json')) {
    config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  } else if (fs.existsSync('config.txt')) {
    const txtContent = fs.readFileSync('config.txt', 'utf8');
    txtContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        config[key.trim()] = value.trim();
      }
    });
  }
  return config;
};

const config = loadConfig();
if (
  !config.ETHERSCAN_KEY ||
  !config.BSCSCAN_KEY ||
  !config.POLYGONSCAN_KEY ||
  !config.ARBISCAN_KEY ||
  !config.OPTIMISM_ETHERSCAN_KEY
) {
  console.error('Please provide valid API keys in config.json or config.txt.');
  process.exit(1);
}

const getWalletInfo = async (address) => {
  const apiKey = config.ETHERSCAN_KEY;
  const apiUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${address}&apikey=${apiKey}`;
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(apiUrl);
      if (response.data && response.data.result) {
        const balanceWei = response.data.result;
        if (balanceWei !== undefined) {
          const balanceEther = ethers.utils.formatEther(balanceWei);
          return { balance: balanceEther, address };
        } else {
          throw new Error('Failed to retrieve valid wallet balance from Etherscan API.');
        }
      } else {
        throw new Error('Failed to retrieve wallet balance from Etherscan API.');
      }
    } catch (error) {
      console.error(`Error retrieving wallet info (retry ${i + 1}): ${error.message}`);
      await delay(1000);
    }
  }
  throw new Error(`Max retries reached. Unable to retrieve wallet info for address ${address}`);
};

const getOtherWalletInfo = async (address, network) => {
  const apiUrl = network === 'BSC'
    ? `https://api.bscscan.com/api?module=account&action=balance&address=${address}&apikey=${config.BSCSCAN_KEY}`
    : network === 'Polygon'
    ? `https://api.polygonscan.com/api?module=account&action=balance&address=${address}&apikey=${config.POLYGONSCAN_KEY}`
    : network === 'Arbitrum'
    ? `https://api.arbiscan.com/api?module=account&action=balance&address=${address}&apikey=${config.ARBISCAN_KEY}`
    : null;

  if (!apiUrl) return null;

  try {
    const response = await axios.get(apiUrl);
    if (response.data && response.data.result) {
      const balanceWei = response.data.result;
      if (balanceWei !== undefined) {
        return ethers.utils.formatEther(balanceWei);
      }
    }
  } catch (error) {
    console.error(`Error retrieving wallet info from ${network} (address: ${address}): ${error.message}`);
  }
  return '0.0';
};

const generateValidRandomWords = async () => {
  let mnemonic;
  do {
    const wordCount = Math.random() < 0.5 ? 12 : 24;
    const randomWords = generate(wordCount).join(' ');

    mnemonic = randomWords;
  } while (!bip39.validateMnemonic(mnemonic));
  return mnemonic;
};

const saveMnemonicToFile = (mnemonic) => {
  fs.appendFileSync('mnemonic.txt', `${mnemonic}\n`, 'utf8');
};

const writeToFile = (data) => {
  const { eth, bnb, polygon, arbitrum, mnemonic } = data;
  const ethBalance = eth ? `${eth.balance} ETH` : '0.0 ETH';
  const bnbBalance = bnb ? `${bnb} BNB` : '0.0 BNB';
  const polygonBalance = polygon ? `${polygon} MATIC` : '0.0 MATIC';
  const arbitrumBalance = arbitrum ? `${arbitrum} ETH` : '0.0 ETH';

  const balanceInfo = [
    ethBalance,
    bnbBalance,
    polygonBalance,
    arbitrumBalance,
  ].join(' || ');

  fs.appendFileSync(
    'results.txt',
    `${data.address} || ${mnemonic} || ${balanceInfo}\n`,
    'utf8'
  );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    let randomWords;
    let checkWallet;
    let walletInfo = { balance: '0.0', address: '' };

    do {
      try {
        randomWords = await generateValidRandomWords();
        checkWallet = ethers.Wallet.fromMnemonic(randomWords);

        walletInfo = await getWalletInfo(checkWallet.address);
        const bnbBalance = await getOtherWalletInfo(checkWallet.address, 'BSC');
        const polygonBalance = await getOtherWalletInfo(checkWallet.address, 'Polygon');
        const arbitrumBalance = await getOtherWalletInfo(checkWallet.address, 'Arbitrum');

        console.log('Wallet Address:', walletInfo.address);
        console.log('ETH Wallet Balance:', walletInfo.balance, 'ETH');
        console.log('BSC Wallet Balance:', bnbBalance, 'BNB');
        console.log('Polygon Wallet Balance:', polygonBalance, 'MATIC');
        console.log('Arbitrum Wallet Balance:', arbitrumBalance, 'ETH');

        saveMnemonicToFile(randomWords);

        writeToFile({
          address: checkWallet.address,
          eth: walletInfo,
          bnb: bnbBalance,
          polygon: polygonBalance,
          arbitrum: arbitrumBalance,
          mnemonic: randomWords,
        });

        await delay(1000);
      } catch (error) {
        console.log(`Error: ${error.message}. Regenerating mnemonic...`);
      }
    } while (walletInfo.balance === '0.0');

  } catch (error) {
    console.log('Program encountered an error:', error);
  }
})();
