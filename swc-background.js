const blankPages = new Set(['about:blank', 'about:newtab']);

const defaultCookieStoreId = 'firefox-default';
const privateCookieStorePrefix = 'firefox-private';

let lastCookieStoreId = defaultCookieStoreId;
let abandonedTabId;

// NOTE: This started out with reading the code of a very small corner of the
// Conex extension, and then stripping out and rewriting much of it.

const openInDifferentContainer = function(cookieStoreId, tab, urlOverride) {
  const tabProperties = {
    active: true,
    cookieStoreId: cookieStoreId,
    index: tab.index + 1,
    openerTabId: tab.openerTabId
  };

  if (urlOverride || !blankPages.has(tab.url)) {
    tabProperties.url = urlOverride || tab.url;
  }

  console.debug('openInDifferentContainer', tabProperties);

  // TODO: this isn't ideal, as it causes a flicker when creating the tab, and
  // breaks the normal close-tab stack. However, I can't see a way to change
  // the cookieStore without making a new tab, or to hook in at the pre-tab-
  // opening stage.
  browser.tabs.create(tabProperties);
  browser.tabs.remove(tab.id);
  abandonedTabId = tab.id;
};

const updateLastCookieStoreId = function(tab) {
  if (
    (!blankPages.has(tab.url) || tab.cookieStoreId != defaultCookieStoreId)
    && tab.cookieStoreId != lastCookieStoreId
    && !tab.cookieStoreId.startsWith(privateCookieStorePrefix)
  ) {
    console.debug(`cookieStoreId changed from ${lastCookieStoreId} -> ${tab.cookieStoreId}`);
    lastCookieStoreId = tab.cookieStoreId;
  }
};

const isPrivilegedURL = function(url) {
  return url == 'about:config' ||
    url == 'about:debugging' ||
    url == 'about:addons' ||
    url.startsWith('chrome:') ||
    url.startsWith('javascript:') ||
    url.startsWith('data:') ||
    url.startsWith('file:') ||
    url.startsWith('about:config');
}

// Event flow is:
// tab.onCreated (tab URL not yet set)
// tab.onActivated
// tab.onUpdated -> status:loading
// webNavigation.onBeforeNavigate -> details.url
// tab.onUpdated -> status:loading + url
// tab.onUpdated -> status:complete

browser.webNavigation.onBeforeNavigate.addListener(details => {
  //console.debug('webNaviagation onBeforeNavigate');
  if (details.tabId == abandonedTabId) {
    console.debug('abandoned tab');
    return;
  }
  if (isPrivilegedURL(details.url)) {
    console.debug("Privileged URL, didn't try containers", details.url);
    return;
  }
  browser.tabs.get(details.tabId).then(tab => {
    console.debug('onBeforeNavigate', tab);
    console.debug('blankPages.has(tab.url)', blankPages.has(tab.url));
    console.debug('tab.openerTabId == undefined', tab.openerTabId == undefined);
    console.debug('tab.cookieStoreId == defaultCookieStoreId', tab.cookieStoreId == defaultCookieStoreId);
    if(
      // tab will be pre-navigation still, so old URL here:
      blankPages.has(tab.url)
      // if we came from another tab, we should let the normal container inheritance
      // happen without overriding it ourselves
      && tab.openerTabId == undefined
      // ...and nothing else has pushed it out of the default container (e.g. incognito)
      && tab.cookieStoreId == defaultCookieStoreId
    ) {
      // It'd be nice if tabs.update worked for this, but it doesn't.
      // TODO: think about the chosen cookie store harder? This works great for new-tab
      // from a container tab, but opening a link from an external handler might grab an
      // unrelated window.
      if (tab.windowId != browser.windows.WINDOW_ID_NONE) {
        browser.tabs.query({windowId: tab.windowId}).then(tabs => {
          console.debug('Window Tab Length', tabs.length);
          if (tabs.length > 1 && tabs[0].cookieStoreId != defaultCookieStoreId) {
            console.debug('Updating tab container');
            updateLastCookieStoreId(tabs[0]);
            openInDifferentContainer(lastCookieStoreId, tab, details.url);
          }
          else {
            console.debug('Single Tab Window');
          }
        }, e => console.error(e));
      }
      else {
        console.debug('WINDOW_ID_NONE');
      }
    }
  }, e => console.error(e));
});


// DEBUG help for me later:
/*
browser.tabs.onCreated.addListener(tab => {
  console.debug('tab onCreated', tab, tab.url);
  browser.tabs.get(tab.id).then(tab => {
    console.log('onCreated tabs.get', tab);
  })
});
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.debug('tab onUpdated', tabId, changeInfo, tab);
});
*/
