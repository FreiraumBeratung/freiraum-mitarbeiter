/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests',
  use: { baseURL: 'http://localhost:5173', headless: true },
  timeout: 30000,
  retries: 0
}

export default config
