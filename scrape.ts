import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://ks-guru-prestasi.vercel.app/');
  
  // Wait for login form
  await page.waitForSelector('input');
  
  // Type credentials
  const inputs = await page.$$('input');
  await inputs[0].type('admin');
  await inputs[1].type('admin');
  
  // Click login button
  const buttons = await page.$$('button[type="submit"]');
  await buttons[0].click();
  
  // Wait for dashboard to load (wait for a nav element or something)
  await new Promise(r => setTimeout(r, 5000));
  
  // Get the HTML of the dashboard
  const html = await page.evaluate(() => {
    return document.body.innerHTML;
  });
  
  console.log(html);
  await browser.close();
})();
