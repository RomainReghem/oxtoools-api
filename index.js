const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ethers, JsonRpcProvider } = require('ethers');
const abi = require('./abi');
require('dotenv').config();
const rateLimit = require('express-rate-limit');

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use(cors({
  origin: ['http://localhost:5173/'] // Replace with the origin you want to allow
}));

const api_key = process.env.LIFI_API_KEY
const contractABI = abi
const providerUrl = `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
const contractAddress = '0xa7fb510e5d7235b3fc8c3d561f41938b52d339ff';
const provider = new JsonRpcProvider(providerUrl);
const contract = new ethers.Contract(contractAddress, contractABI, provider);

let cachedChains = []
async function fetchChains() {
  try {
    const response = await fetch('https://li.quest/v1/chains?chainTypes=SVM&chainTypes=EVM');
    if (!response.ok) {
      throw new Error('Failed to fetch chains');
    }
    const data = await response.json();
    cachedChains = data.chains;
  } catch (error) {
    console.error('Error fetching chains:', error);
  }
}
fetchChains();
setInterval(fetchChains, 24 * 60 * 60 * 1000); // Refetch chains every 24h



const isWhitelistedOnContract = async (address) => {
  try {
    const isWhitelisted = await contract.isWhitelisted(address);
    return isWhitelisted
  } catch (error) {
    return false
  }

}

const frens = []
const blacklist = []
const whitelist = []
const checkUserWhitelist = async (user) => {
  if (blacklist.includes(user)) return false
  if (whitelist.includes(user) || frens.includes(user)) return true
  else {
    const isWhitelisted = await isWhitelistedOnContract(user)
    if (isWhitelisted) whitelist.push(user)
    return isWhitelisted
  }
}


app.get('/', (req, res) => {
  res.send('Welcome to my Express API!');
});

app.get('/chains', async (req, res) => {
  if (cachedChains) {
    return res.send(cachedChains);
  } else {
    return res.status(505).json({ error: 'Chains data is not available' });
  }
})

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 20, // limit each IP to 100 requests per windowMs
});

app.post('/transfers', limiter, async (req, res) => {
  const { user, walletToCheck, fromTimestamp } = req.body
  console.log('transfer!', walletToCheck)
  if (!walletToCheck) return res.status(400)
  if (!user) return res.status(420)
  const isUserWhitelisted = await checkUserWhitelist(user)
  if (!isUserWhitelisted) return res.status(420)

  try {
    const response = await fetch(`https://li.quest/v1/analytics/transfers?wallet=${walletToCheck}&fromTimestamp=${fromTimestamp}&integrator=jumper.exchange`, {
      headers: {
        'x-lifi-api-key': api_key
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch chains');
    }

    const transfers = await response.json()
    res.send(transfers.transfers)
  } catch (error) {
    console.log(error)
    return res.status(505).json({ error: 'Transfers data is not available' });
  }
})

app.get('/isWhitelisted', async (req, res) => {
  try {
    const addressToCheck = req.query.address;
    const isWhitelisted = await isWhitelistedOnContract(addressToCheck)
    res.send(isWhitelisted);
  } catch (error) {
    console.error('Error querying contract:', error);
    res.status(500).json({ error: 'An error occurred while querying the contract' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
