
const https = require('https');

function checkUrl(url) {
  console.log(`Checking ${url}...`);
  https.get(url, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:', res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Body (first 500 chars):', data.substring(0, 500));
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
}

checkUrl('https://ashokaproducts.in/api/categories?limit=8&page=1');
checkUrl('https://ashokaproducts.in/api/products?limit=8&page=1');
