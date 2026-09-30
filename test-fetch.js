
const https = require('https');

const url = 'https://ashokaproducts.in/api/products?limit=8&page=1';

https.get(url, (res) => {
  console.log('StatusCode:', res.statusCode);
  console.log('Headers:', res.headers);
  
  if (res.statusCode >= 300 && res.statusCode < 400) {
      console.log('Redirecting to:', res.headers.location);
  }
}).on('error', (e) => {
  console.error(e);
});
