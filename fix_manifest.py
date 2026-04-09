import json

with open('webextensions/manifest.json', 'r') as f:
    data = json.load(f)

# Need to change web_accessible_resources format for MV3
if 'web_accessible_resources' in data and isinstance(data['web_accessible_resources'], list):
    if len(data['web_accessible_resources']) > 0 and isinstance(data['web_accessible_resources'][0], str):
        # Convert MV2 style list of strings to MV3 style
        resources = data['web_accessible_resources']
        data['web_accessible_resources'] = [{
            "resources": resources,
            "matches": ["<all_urls>"]
        }]

# Background scripts for MV3 require a service worker or a background page (only in MV2).
# However, this project uses an HTML background page to load modules.
# Chrome MV3 extensions cannot use background pages. But we're migrating to Chrome.
# Let's keep MV2 for now and use sidePanel polyfill with background.page if possible.
# Oh wait, Chrome sidePanel requires MV3.
# If we convert to MV3, we have to convert background.html to service worker.
# Let's try sticking to MV2 first, but Chrome disabled MV2. We HAVE to use MV3.
# Let's convert the background page to a service worker.

# What does background.html do?
# <script type="module" src="./background.js"></script>

data['background'] = {
    "service_worker": "background/background.js",
    "type": "module"
}

# browser_action -> action
if 'browser_action' in data:
    data['action'] = data['browser_action']
    del data['browser_action']

with open('webextensions/manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
