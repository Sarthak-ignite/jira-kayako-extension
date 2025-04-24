# Jira-Kayako Link Extension

A simple Chrome extension that converts Zendesk Ticket IDs in Jira to clickable links that open the corresponding Kayako conversation.

## Features

- Automatically detects the "Central Zendesk Ticket IDs" field in Jira tickets
- Converts the ticket ID numbers into clickable links
- Opens Kayako conversations in a new tab with the format: `https://central-supportdesk.kayako.com/agent/conversations/{zendesk_id}`
- Works with dynamically loaded content

## Installation

1. Download or clone this repository to your computer
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now be installed and active

## Usage

1. Navigate to any Jira ticket that contains a "Central Zendesk Ticket IDs" field
2. The ticket ID will automatically be converted to a clickable link
3. Click the link to open the corresponding Kayako conversation in a new tab

## Files Included

- `manifest.json`: Extension configuration
- `content.js`: Script that runs on Jira pages
- `icon48.png` and `icon128.png`: Extension icons
- `README.md`: This file

## Notes

- This extension only works on pages that match `*://*.atlassian.net/*`
- You'll need to replace the icons with your own if desired 