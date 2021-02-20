const fs = require('fs');
const Web3 = require('web3');
const abi = require('human-standard-token-abi');

const CONFIG = require('dotenv').config().parsed;
const web3 = new Web3();
const { toBN, toChecksumAddress } = web3.utils;

const INFURA_ENDPOINT = CONFIG.INFURA_ENDPOINT;
const START_BLOCK = Number(CONFIG.START_BLOCK);
const END_BLOCK = Number(CONFIG.END_BLOCK);
const ADDRESS = CONFIG.ADDRESS;
const EXCLUDED = JSON.parse(CONFIG.EXCLUDED).map(toChecksumAddress);

web3.setProvider(new Web3.providers.HttpProvider(INFURA_ENDPOINT));
const contract = new web3.eth.Contract(abi, ADDRESS);

const fromCSV = fs.readFileSync(`${__dirname}/tokenholders.csv`, 'utf8')
  .split('\n')
  .slice(1)
  .filter(s => s !== '')
  .map(row => {
    const [address] = row.replace(/"/g, '').split(',');
    return toChecksumAddress(address)
  })

const main = async () => {
  console.log(`start block number:\t${CONFIG.START_BLOCK}`);
  const latestBlockNumber = await web3.eth.getBlockNumber()
  console.log(`end block number:\t${latestBlockNumber}`);
  const events = await contract.getPastEvents('Transfer', {fromBlock: START_BLOCK, toBlock: latestBlockNumber});
  const addresses = []
  for (const {returnValues: {_from, _to}} of events) {
    if (!EXCLUDED.includes(_from)) addresses.push(_from);
    if (!EXCLUDED.includes(_to)) addresses.push(_to);
  }
  const unique = [...new Set(addresses)];
  console.log(`unique addresses found:\t${unique.length}`);

  const balances = [];
  const compensated = [];
  const accounts = new Map();
  const compensatedAccounts = new Map();
  for (const address of unique) {
    const balance = await contract.methods.balanceOf(address).call();
    const bn = toBN(balance);
    if (!bn.isZero()) {
      balances.push(balance);
      const compensatedBalance = bn.mul(toBN('110')).div(toBN('98')).toString();
      compensated.push(compensatedBalance);
      accounts.set(address, balance);
      compensatedAccounts.set(address, compensatedBalance);
    }
  }
  console.log(`non-empty accounts:\t${accounts.size}`);

  fs.writeFileSync(`accounts.txt`, Array.from(accounts).map(([k, v]) => `${k}: ${v}`).join('\n'));
  fs.writeFileSync(`compensatedAccounts.txt`, Array.from(compensatedAccounts).map(([k, v]) => `${k}: ${v}`).join('\n'));
  fs.writeFileSync(`addresses.txt`, addresses.join('\n'));
  fs.writeFileSync(`balances.txt`, balances.join('\n'));
  fs.writeFileSync(`compensated.txt`, compensated.join('\n'));
  console.log('files created');

  // const test = new Map();
  // fs.readFileSync(`${__dirname}/accounts.txt`, 'utf8')
  //   .split('\n')
  //   .map(row => {
  //     const [address, balance] = row.split(':');
  //     test.set(address.trim(), balance.trim());
  //   })
  // const args = createArgs(test);
  const args = createArgs(compensatedAccounts);
  for (let i = 0; i < args.length; i++) {
    fs.writeFileSync(`args_${i}.txt`, args[i])
  }
  console.log('success!');
}

main();

function splitArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const chunk = Math.floor(i / chunkSize);
    const index = i % chunkSize;
    if (!result[chunk]) result[chunk] = [];
    result[chunk][index] = arr[i];
  }
  return result;
}

function createArgs(accounts) {
  const groups = splitArray(Array.from(accounts), 100);
  return groups.map(group => {
    const addresses = group.map(x => `"${x[0]}"`).join(',');
    const balances = group.map(x => `"${x[1]}"`).join(',');
    return `[${addresses}],\n[${balances}]`
  })
}
