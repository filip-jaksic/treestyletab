const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const extensionPath = path.resolve(__dirname);
  console.log('Loading extension from:', extensionPath);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    dumpio: true // Forward browser logs to stdout
  });

  console.log('Browser launched with extension.');

  try {
      const page = await browser.newPage();
      await page.goto('chrome://extensions/');
      await new Promise(r => setTimeout(r, 2000));

  } catch (err) {
      console.error('Error during testing:', err);
  } finally {
      await browser.close();
      console.log('Browser closed.');
  }
})();
