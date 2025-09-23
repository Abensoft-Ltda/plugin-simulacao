

async function fillFields() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    const tab = tabs[0]
    if(!tab?.id) return;

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content-script.js']
    });


}