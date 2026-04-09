import os
import glob

def prepend_polyfill(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    if 'import \'/chrome-polyfill.js\';' not in content:
        # Prepend it, but keeping strict mode at the top if present
        if content.startswith("'use strict';\n"):
             content = "'use strict';\nimport '/chrome-polyfill.js';\n" + content[14:]
        elif content.startswith("/*"):
            # Find the end of the comment block
            idx = content.find("*/\n")
            if idx != -1:
                idx += 3
                if content[idx:].startswith("'use strict';\n"):
                    idx += 14
                content = content[:idx] + "import '/chrome-polyfill.js';\n" + content[idx:]
            else:
                content = "import '/chrome-polyfill.js';\n" + content
        else:
            content = "import '/chrome-polyfill.js';\n" + content

        with open(filepath, 'w') as f:
            f.write(content)

# Inject into background.js
prepend_polyfill('webextensions/background/background.js')
prepend_polyfill('webextensions/sidebar/sidebar.js')
prepend_polyfill('webextensions/options/init.js')
