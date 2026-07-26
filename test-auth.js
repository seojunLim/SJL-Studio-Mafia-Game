const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });

  try {
    // Test 1: Auth screen is shown first
    console.log('--- Test 1: Auth screen is default ---');
    const page1 = await browser.newPage();
    await page1.goto('http://localhost:3000');
    await page1.waitForSelector('#screen-auth.active');
    console.log('PASS: Auth screen is active by default');

    const mainMenuActive = await page1.$('#screen-main-menu.active');
    console.log(mainMenuActive ? 'FAIL: Main menu should not be active' : 'PASS: Main menu is not active');

    // Test 2: Guest flow
    console.log('\n--- Test 2: Guest flow ---');
    await page1.click('#btnGuest');
    await page1.waitForSelector('#screen-main-menu.active');
    console.log('PASS: Guest button leads to main menu');

    const authStatusText = await page1.textContent('#authStatusText');
    console.log(`Auth status: "${authStatusText}" - ${authStatusText === '비회원' ? 'PASS' : 'FAIL'}`);

    const rankedDisabled = await page1.$eval('#btnRanked', el => el.disabled);
    console.log(`Ranked disabled for guest: ${rankedDisabled ? 'PASS' : 'FAIL'}`);

    const rankedDesc = await page1.textContent('#rankedDesc');
    console.log(`Ranked desc: "${rankedDesc}" - ${rankedDesc === '로그인 필요' ? 'PASS' : 'FAIL'}`);

    const friendlyDisabledNoName = await page1.$eval('#btnFriendly', el => el.disabled);
    console.log(`Friendly disabled (no name): ${friendlyDisabledNoName ? 'PASS' : 'FAIL'}`);

    await page1.fill('#mainPlayerName', '게스트');
    await page1.waitForTimeout(100);
    const friendlyEnabled = await page1.$eval('#btnFriendly', el => !el.disabled);
    console.log(`Friendly enabled (with name): ${friendlyEnabled ? 'PASS' : 'FAIL'}`);

    const rankedStillDisabled = await page1.$eval('#btnRanked', el => el.disabled);
    console.log(`Ranked still disabled after name: ${rankedStillDisabled ? 'PASS' : 'FAIL'}`);
    await page1.close();

    // Test 3: Register flow
    console.log('\n--- Test 3: Register flow ---');
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:3000');
    await page2.waitForSelector('#screen-auth.active');
    await page2.click('#tabRegister');

    await page2.fill('#registerUsername', '테스터');
    await page2.fill('#registerPassword', '1234');
    await page2.fill('#registerPasswordConfirm', '5678');
    await page2.click('#btnRegister');
    await page2.waitForTimeout(500);
    const mismatchError = await page2.textContent('#authError');
    console.log(`Password mismatch: "${mismatchError}" - ${mismatchError.includes('일치') ? 'PASS' : 'FAIL'}`);

    await page2.fill('#registerPasswordConfirm', '1234');
    await page2.click('#btnRegister');
    await page2.waitForSelector('#screen-main-menu.active');
    console.log('PASS: Registration successful');

    const loggedInStatus = await page2.textContent('#authStatusText');
    console.log(`Status: "${loggedInStatus}" - ${loggedInStatus === '테스터' ? 'PASS' : 'FAIL'}`);

    const rankedEnabled = await page2.$eval('#btnRanked', el => !el.disabled);
    console.log(`Ranked enabled: ${rankedEnabled ? 'PASS' : 'FAIL'}`);

    const nameDisabled = await page2.$eval('#mainPlayerName', el => el.disabled);
    console.log(`Name locked: ${nameDisabled ? 'PASS' : 'FAIL'}`);
    await page2.close();

    // Test 4: Login flow
    console.log('\n--- Test 4: Login flow ---');
    const page3 = await browser.newPage();
    await page3.goto('http://localhost:3000');
    await page3.waitForSelector('#screen-auth.active');

    await page3.fill('#loginUsername', '테스터');
    await page3.fill('#loginPassword', 'wrong');
    await page3.click('#btnLogin');
    await page3.waitForTimeout(500);
    const wrongPwErr = await page3.textContent('#authError');
    console.log(`Wrong password: "${wrongPwErr}" - ${wrongPwErr.includes('비밀번호') ? 'PASS' : 'FAIL'}`);

    await page3.fill('#loginPassword', '1234');
    await page3.click('#btnLogin');
    await page3.waitForSelector('#screen-main-menu.active');
    console.log('PASS: Login successful');

    await page3.click('#btnLogout');
    await page3.waitForSelector('#screen-auth.active');
    console.log('PASS: Logout returns to auth screen');
    await page3.close();

    // Test 5: Duplicate registration
    console.log('\n--- Test 5: Duplicate registration ---');
    const page4 = await browser.newPage();
    await page4.goto('http://localhost:3000');
    await page4.click('#tabRegister');
    await page4.fill('#registerUsername', '테스터');
    await page4.fill('#registerPassword', '1234');
    await page4.fill('#registerPasswordConfirm', '1234');
    await page4.click('#btnRegister');
    await page4.waitForTimeout(500);
    const dupErr = await page4.textContent('#authError');
    console.log(`Duplicate error: "${dupErr}" - ${dupErr.includes('이미 사용') ? 'PASS' : 'FAIL'}`);
    await page4.close();

    // Test 6: Naver meta tag
    console.log('\n--- Test 6: Naver meta tag ---');
    const page5 = await browser.newPage();
    await page5.goto('http://localhost:3000');
    const naverMeta = await page5.$('meta[name="naver-site-verification"]');
    const naverContent = naverMeta ? await naverMeta.getAttribute('content') : null;
    console.log(`Naver meta: ${naverContent === '832e74f67c8aa44c5f1256621a6e7a18807fa6a5' ? 'PASS' : 'FAIL'}`);
    await page5.close();

    console.log('\n=== All tests completed ===');
  } catch (err) {
    console.error('TEST ERROR:', err.message);
  } finally {
    await browser.close();
  }
})();
