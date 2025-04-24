# Jira-Kayako Link Extension

A simple Chrome extension that converts Zendesk Ticket IDs in Jira to clickable links that open the corresponding Kayako conversation.

## Features

- Automatically detects the "Central Zendesk Ticket IDs" field in Jira tickets
- Converts the ticket ID numbers into clickable links
- Opens Kayako conversations in a new tab with the format: `https://central-supportdesk.kayako.com/agent/conversations/{zendesk_id}`
- Works with dynamically loaded content
- Preserves field editability by only converting the ID text to a link

## Installation

### From Source

1. Clone this repository to your computer
2. Download the icon from any Material Design icon repository or create your own
3. Save it as `icon48.png` and `icon128.png` in the extension directory
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" by toggling the switch in the top right corner
6. Click "Load unpacked" and select the folder containing the extension files
7. The extension should now be installed and active

## Usage

1. Navigate to any Jira ticket that contains a "Central Zendesk Ticket IDs" field
2. The ticket ID will automatically be converted to a clickable link
3. Click the link to open the corresponding Kayako conversation in a new tab
4. You can still click on the empty space in the field to edit it