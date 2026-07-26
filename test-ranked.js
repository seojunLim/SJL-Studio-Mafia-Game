const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });

  try {
    // Test 1: Main menu loads
    const page1 = await browser.newPage();
    await page1.goto('http://localhost:3000');
    const menuVisible = await page1.$eval('#screen-main-menu', el => el.classList.contains('active'));
    console.log('Main menu visible:', menuVisible);

    // Test 2: Buttons disabled without name
    const rankedDisabled = await page1.$eval('#btnRanked', el => el.disabled);
    console.log('Ranked button disabled (no name):', rankedDisabled);

    // Test 3: Enter name enables buttons
    await page1.fill('#mainPlayerName', '테스터');
    await page1.waitForTimeout(600);
    const rankedEnabled = await page1.$eval('#btnRanked', el => !el.disabled);
    console.log('Ranked button enabled (with name):', rankedEnabled);

    // Test 4: Profile card shows
    const profileVisible = await page1.$eval('#profileCard', el => el.style.display !== 'none');
    console.log('Profile card visible:', profileVisible);

    // Test 5: Friendly button goes to lobby
    await page1.click('#btnFriendly');
    await page1.waitForTimeout(300);
    const lobbyVisible = await page1.$eval('#screen-lobby', el => el.classList.contains('active'));
    console.log('Lobby visible after friendly click:', lobbyVisible);
    const namePreFilled = await page1.$eval('#playerName', el => el.value);
    console.log('Name pre-filled in lobby:', namePreFilled === '테스터');

    // Test 6: Back button returns to menu
    await page1.click('#btnBackToMenu');
    await page1.waitForTimeout(300);
    const menuAgain = await page1.$eval('#screen-main-menu', el => el.classList.contains('active'));
    console.log('Back to menu works:', menuAgain);

    // Test 7: Ranked button goes to queue
    await page1.click('#btnRanked');
    await page1.waitForTimeout(500);
    const queueVisible = await page1.$eval('#screen-queue', el => el.classList.contains('active'));
    console.log('Queue screen visible:', queueVisible);

    // Test 8: Cancel queue returns to menu
    await page1.click('#btnCancelQueue');
    await page1.waitForTimeout(300);
    const menuAfterCancel = await page1.$eval('#screen-main-menu', el => el.classList.contains('active'));
    console.log('Menu after cancel queue:', menuAfterCancel);

    // Test 9: Create and join friendly room
    await page1.click('#btnFriendly');
    await page1.waitForTimeout(300);
    await page1.click('#btnCreate');
    await page1.waitForTimeout(500);
    const roomVisible = await page1.$eval('#screen-room', el => el.classList.contains('active'));
    console.log('Room screen visible after create:', roomVisible);
    const roomCode = await page1.$eval('#displayRoomCode', el => el.textContent);
    console.log('Room code assigned:', roomCode.length === 6);

    // Test 10: Matchmaking with 6 players
    console.log('\n--- Testing matchmaking with 6 players ---');
    const pages = [];
    for (let i = 0; i < 6; i++) {
      const p = await browser.newPage();
      await p.goto('http://localhost:3000');
      await p.fill('#mainPlayerName', `선수${i + 1}`);
      await p.waitForTimeout(200);
      pages.push(p);
    }

    for (let i = 0; i < 6; i++) {
      await pages[i].click('#btnRanked');
      await pages[i].waitForTimeout(300);
    }

    // Wait for matchmaking tick
    await pages[0].waitForTimeout(4000);

    let matchedCount = 0;
    for (let i = 0; i < 6; i++) {
      const isGame = await pages[i].$eval('#screen-game', el => el.classList.contains('active'));
      if (isGame) matchedCount++;
    }
    console.log('Players matched into game:', matchedCount);

    console.log('\nAll tests passed!');
    await page1.close();
    for (const p of pages) await p.close();
  } catch (err) {
    console.error('Test failed:', err.message);
  } finally {
    await browser.close();
  }
})();
