const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const bip39 = require('bip39'); // Importing bip39 for mnemonic validation

// Fungsi untuk memuat konfigurasi dari file JSON atau TXT
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

// Memuat konfigurasi API keys
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

// Fungsi untuk mendapatkan informasi dompet dari Etherscan
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

// Fungsi untuk mendapatkan saldo dari jaringan lain
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

// Fungsi untuk membuat mnemonic acak yang valid
const generateValidRandomWords = async () => {
  const { generate } = await import('random-words'); // Menggunakan dynamic import untuk random-words
  let mnemonic;
  do {
    // Menghasilkan 12 atau 24 kata acak
    const wordCount = Math.random() < 0.5 ? 12 : 24;
    const randomWords = generate(wordCount).join(' ');

    // Validasi mnemonic
    mnemonic = randomWords;
  } while (!bip39.validateMnemonic(mnemonic)); // Validasi mnemonic dengan bip39
  return mnemonic;
};

// Fungsi untuk menulis data ke file
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

// Fungsi delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Blok eksekusi utama
(async () => {
  try {
    let randomWords;
    let checkWallet;
    let walletInfo = { balance: '0.0', address: '' };

    do {
      try {
        randomWords = await generateValidRandomWords(); // Menghasilkan mnemonic yang valid
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

        if (parseFloat(walletInfo.balance) > 0 || parseFloat(bnbBalance) > 0 || parseFloat(polygonBalance) > 0 || parseFloat(arbitrumBalance) > 0) {
          console.log('Wallet with balance found!');
          writeToFile({
            address: checkWallet.address,
            eth: walletInfo,
            bnb: bnbBalance,
            polygon: polygonBalance,
            arbitrum: arbitrumBalance,
            mnemonic: randomWords,
          });
          process.exit();
        }

        await delay(1000);
      } catch (error) {
        console.log(`Error: ${error.message}. Regenerating mnemonic...`);
      }
    } while (walletInfo.balance === '0.0');

  } catch (error) {
    console.log('Program encountered an error:', error);
  }
})();
