const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
// const setTimeout = require('node:timers/promises');

// Load URLs from CSV
const loadUrlsFromCsv = (filePath) => {
    return new Promise((resolve, reject) => {
        const urls = new Set();
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => urls.add(row['Page URL']))
            .on('end', () => resolve(Array.from(urls)))
            .on('error', reject);
    });
};

// Define main Puppeteer function
(async () => {
    const browser = await puppeteer.launch({ 
        headless: false,
        ignoreHTTPSErrors: true,  
        args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        // '--ignore-certificate-errors-spki-list',
        'disable-web-security',
        // '--disable-gpu',
        '--window-size=1920,1080', // Set a specific window size
        '--disable-dev-shm-usage', // Prevents issues with Docker memory limits
        '--disable-background-timer-throttling', // Disables throttling of background timers
        // '--disable-backgrounding-occluded-windows',
        // '--disable-renderer-backgrounding',
        ],
        defaultViewport: {
            width: 1920,
            height: 1080,
        },
    });
    const page = await browser.newPage();
    const urls = await loadUrlsFromCsv(path.join(__dirname, 'csv', 'pageUrlsCSV.csv'));

    // Step 1: Login
    await page.goto('https://localhost/login');
    console.log("Navigated to login page");

    await page.waitForSelector('input[name="email"]');
    await page.type('input[name="email"]', 'adrian.gluh@nexuspoint.co.uk');
    await page.type('input[name="password"]', 'Password123!');
    await page.type('input[name="domain"]', 'swanswaygarages');
    await page.click('button[type="submit"]');
    console.log("Logged in successfully");

    // Check for modal about software update after login
    try {
        await page.waitForSelector('#__layout > div > div.modal-center.new-software-version-modal', { timeout: 3000 });
        console.log('Software update modal detected');

        // Click the button to close the modal
        await page.click('#__layout > div > div.modal-center.new-software-version-modal > div > div > div > button');
        console.log('Closed software update modal');

        //Wait for the page to reload
        await page.waitForNavigation();
        console.log('Page successfuly reloaded');

    } catch(error) {
        // modal didn't appear: log and continue
        console.log('Software update modal not detected, process continues');
    }    

    // Step 2: Navigate to View/Edit Pages
    await page.waitForSelector('#__layout > div > main > section.suite-collection > div > article.package.cms.aos-init.aos-animate > a');
    await page.click('#__layout > div > main > section.suite-collection > div > article.package.cms.aos-init.aos-animate > a');
    console.log("Navigated to CMS");

    
    // Click on the view/edit pages button
    await page.waitForSelector('#__layout > div > main > section.page-header-dark.page-header-dashboard.cf.margin-bottom-none > div > div > div > section > a:nth-child(6)');
    console.log("Found view/edit pages button");
    
    await page.click('#__layout > div > main > section.page-header-dark.page-header-dashboard.cf.margin-bottom-none > div > div > div > section > a:nth-child(6)');
    console.log("Navigated to View/Edit Pages");
    
    // await new Promise(resolve => setTimeout(resolve, 10000000)); 

    // Process each URL in the CSV
    for (let url of urls) {

        // Extract part of URL after ".com/"
        const searchTerm = url.split('.com/')[1];
        console.log(`Processing URL: ${url}`);
        
        // Step 3: Search for page
        await page.waitForSelector('#cms_pages_search');
        console.log("Found search input");
        
        // clear the #pages-search input before typing new altTextInput
        await page.evaluate(() => {
            const searchInput = document.querySelector('#cms_pages_search');
            if (searchInput) {
                searchInput.value = '';
            }
        });
        console.log("Cleared previous search url");
        
        await page.type('#cms_pages_search', searchTerm);
        console.log(`Searching for page: ${searchTerm}`);

        // check the Show child pages select option
        await page.waitForSelector('#cms_pages-show-children > option:nth-child(3)');
        console.log("Found Show child pages select option");
        await page.select('#cms_pages-show-children', 'true');
        console.log("Selected Show child pages option: ", 'TRUE');

        await new Promise(resolve => setTimeout(resolve, 5000)); 
        
        // click the open row actions button
        const openRowActionsbuttons = await page.$$('button.no-style.blank.a-icon-button[data-original-title="Open row actions"]');
        if (openRowActionsbuttons.length > 0) {
            await openRowActionsbuttons[0].click();
            console.log("Clicked button to view options");
        }
        // console.log("Clicked button to view options");
        
        // click the edit page button
        const editPageButton = await page.$$('span.text-body-desktop-paragraph');
        if (editPageButton.length > 0) {
            await editPageButton[0].click();
            console.log("Selected specific option");
        }

        await new Promise(resolve => setTimeout(resolve, 2000)); 

        // Step 4: Navigate to Builder tab and locate Image Grid
        await page.waitForSelector('nav.page-header-nav');
        await page.click('nav > ul > li:nth-child(2)');
        console.log("Navigated to Builder tab");

        await new Promise(resolve => setTimeout(resolve, 2000)); 
        
        const imageGridSectionHandle = await page.evaluateHandle(() => {
            // find the header with the specific text and get its parent section
            const headers = Array.from(document.querySelectorAll('div.component > section > header'));
            return headers.find(header => header.textContent.includes('Image Grid')).parentElement || null;
        });

        if (!imageGridSectionHandle) {
            console.error("Image Grid section not found");
            await browser.close();
            return;
        }

        await page.evaluate((section) => {
                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, imageGridSectionHandle);
        console.log("Scrolled down to Image Grid section");

        // Get the fieldsets within the Image Grid
        const fieldsets = await page.$$('form.form1 > fieldset');
        if(fieldsets.length === 0) {
            console.log("No fieldsets found within the Image Grid");
        } else {
            console.log(`Found ${fieldsets.length} fieldsets`);
        }

        // Loop through each fieldset
        for (let fieldset of fieldsets) {
            // Locate Image input
            const imageInput = await fieldset.$('div.col-5 > form > div > div > input');

            if (imageInput) {
                console.log("Located image input"); 
            } else { 
                console.error("Image input not found in this fieldset");
                continue;
            }

            const currentImageValue = await page.evaluate(el => el.value, imageInput);
            const altTextInput = currentImageValue.split('/uploads/')[1];
            
            console.log(`Alt text extracted: ${altTextInput}`);
            
            // Clear the Image input
            await imageInput.click({ clickCount: 3 });
            await imageInput.press('Backspace');
            console.log("Cleared image input");
            
            await new Promise(resolve => setTimeout(resolve, 2000)); 
            // Open image lookup
            const lookupButton = await fieldset.$('section > form.form1 > fieldset > div.col-5 > form > div > button');
            await lookupButton.click();
            console.log("Clicked image lookup button");
            
            // Step 5: Search for image in modal
            await page.waitForSelector('.media-manager.modal-center #pages-search');

            // clear the #pages-search input before typing new altTextInput
            await page.evaluate(() => {
                const searchInput = document.querySelector('#pages-search');
                if (searchInput) {
                    searchInput.value = '';
                }
            });
            console.log("Cleared previous search text in the modal");

            await page.type('#pages-search', altTextInput);
            console.log(`Searching for image: ${altTextInput}`);
            
            await page.waitForSelector('.overlay .cta button.only-icon:nth-child(1)');
            console.log("Found select image button");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            await page.evaluate(() => {
                const button = document.querySelector('.overlay .cta button.only-icon:nth-child(1)');
                if (button) {
                    button.style.display = 'block';
                    button.style.visibility = 'visible';
                }
                button.click();
            });
            console.log("Overlay button clicked successfully");
            
            // Step 6: Confirm alt text population and repeat for each fieldset
            const bannerImageAltInput = await fieldset.$('#banner-image-alt');
            const populatedValue = await page.evaluate(el => el.value, bannerImageAltInput);
            
            if (populatedValue) {
                console.log("Alt text populated successfully:", populatedValue);
            } else {
                console.error("Alt text population failed");
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); 
        }
        
        // Save changes
        await page.click('button.no-style.blank.a-button.primary.fit');
        console.log("Clicked save button");
        await page.waitForResponse(response => response.status() === 200);
        console.log("Changes saved successfully");
        
        // Return to previous page for next URL
        await page.goBack();
        await new Promise(resolve => setTimeout(resolve, 2000)); 
    }
    
    // await new Promise(resolve => setTimeout(resolve, 10000000)); 
    await browser.close();
    console.log("Script completed.");
})();
