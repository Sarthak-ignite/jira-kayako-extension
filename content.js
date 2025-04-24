// Function to find and convert Zendesk Ticket IDs to clickable links
function convertZendeskIdsToLinks() {
  let convertedFields = 0;

  // Method 1: Look for fields with specific label text
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    // Skip script and style elements
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
    
    // Check if this element or any of its children contains the text "Central Zendesk Ticket IDs"
    if (element.textContent && element.textContent.includes('Central Zendesk Ticket IDs')) {
      // Try to find the value container - look at siblings, children, or nearby elements
      let potentialValueContainers = [];
      
      // Check siblings
      if (element.nextElementSibling) {
        potentialValueContainers.push(element.nextElementSibling);
      }
      
      // Check parent's children
      if (element.parentElement) {
        Array.from(element.parentElement.children).forEach(child => {
          if (child !== element) {
            potentialValueContainers.push(child);
          }
        });
      }
      
      // Check for elements with common Jira value classes
      const nearbyValueElements = document.querySelectorAll('[data-test-id="issue.field.value"], [data-test-id="issue.views.field.rich-text.rich-text-body"]');
      nearbyValueElements.forEach(valueEl => {
        if (isElementNearby(element, valueEl, 5)) { // Check if within 5 levels
          potentialValueContainers.push(valueEl);
        }
      });
      
      // Process potential value containers
      for (const container of potentialValueContainers) {
        if (container.querySelector('a.zendesk-link')) continue; // Skip if already processed
        
        const textContent = container.textContent.trim();
        if (textContent && !isNaN(parseInt(textContent)) && textContent.length >= 5) {
          // Create a link element
          const link = document.createElement('a');
          link.href = `https://central-supportdesk.kayako.com/agent/conversations/${textContent}`;
          link.textContent = textContent;
          link.className = 'zendesk-link';
          link.style.color = '#0052CC';
          link.style.textDecoration = 'underline';
          link.target = '_blank';
          link.title = "Open in Kayako";
          
          // Replace only the text node with our link, not the entire container
          replaceTextWithLink(container, textContent, link);
          convertedFields++;
        }
      }
    }
  }
  
  // Method 2: Try the original selectors as a fallback
  tryOriginalSelectors();
}

// Function to replace only the text node containing the ID with a link
function replaceTextWithLink(container, text, link) {
  // Find all text nodes within the container
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue.includes(text)) {
      // If this text node contains our ID
      const textBeforeID = node.nodeValue.substring(0, node.nodeValue.indexOf(text));
      const textAfterID = node.nodeValue.substring(node.nodeValue.indexOf(text) + text.length);
      
      // Create text nodes for before and after
      const beforeNode = document.createTextNode(textBeforeID);
      const afterNode = document.createTextNode(textAfterID);
      
      // Replace the original text node with: beforeText + link + afterText
      if (textBeforeID) {
        node.parentNode.insertBefore(beforeNode, node);
      }
      
      node.parentNode.insertBefore(link, node);
      
      if (textAfterID) {
        node.parentNode.insertBefore(afterNode, node);
      }
      
      // Remove the original text node
      node.parentNode.removeChild(node);
      return;
    }
  }
}

// Check if two elements are nearby in the DOM hierarchy
function isElementNearby(el1, el2, maxLevels) {
  // Check if one element is a descendant of the other
  if (el1.contains(el2) || el2.contains(el1)) return true;
  
  // Check if they share a common ancestor within maxLevels
  let parent1 = el1.parentElement;
  for (let i = 0; i < maxLevels; i++) {
    if (!parent1) break;
    if (parent1.contains(el2)) return true;
    parent1 = parent1.parentElement;
  }
  
  return false;
}

// Try the original selectors as a fallback
function tryOriginalSelectors() {
  // Look for field labels that contain "Central Zendesk Ticket IDs"
  const fieldLabels = document.querySelectorAll('[data-test-id="issue.views.field.rich-text.label"]');
  
  fieldLabels.forEach(label => {
    if (label.textContent.includes('Central Zendesk Ticket IDs')) {
      // Find the corresponding field value container
      const fieldContainer = label.closest('[data-test-id="issue.views.issue-base.content"]');
      if (!fieldContainer) return;
      
      const valueContainer = fieldContainer.querySelector('[data-test-id="issue.views.field.rich-text.rich-text-body"]');
      if (!valueContainer) return;
      
      // If already processed, skip
      if (valueContainer.querySelector('a.zendesk-link')) return;
      
      // Get the ticket ID from the field value
      const ticketIdText = valueContainer.textContent.trim();
      if (!ticketIdText || isNaN(parseInt(ticketIdText))) return;
      
      // Create a link element
      const link = document.createElement('a');
      link.href = `https://central-supportdesk.kayako.com/agent/conversations/${ticketIdText}`;
      link.textContent = ticketIdText;
      link.className = 'zendesk-link';
      link.style.color = '#0052CC';
      link.style.textDecoration = 'underline';
      link.target = '_blank';
      link.title = "Open in Kayako";
      
      // Replace only the text node with our link
      replaceTextWithLink(valueContainer, ticketIdText, link);
    }
  });

  // Also look for the field in the sidebar
  const sidebarFields = document.querySelectorAll('[data-test-id="issue.views.field.base"]');
  
  sidebarFields.forEach(field => {
    const label = field.querySelector('[data-test-id="issue.field.label"]');
    if (label && label.textContent.includes('Central Zendesk Ticket IDs')) {
      const valueElement = field.querySelector('[data-test-id="issue.field.value"]');
      if (!valueElement) return;
      
      // If already processed, skip
      if (valueElement.querySelector('a.zendesk-link')) return;
      
      const ticketIdText = valueElement.textContent.trim();
      if (!ticketIdText || isNaN(parseInt(ticketIdText))) return;
      
      const link = document.createElement('a');
      link.href = `https://central-supportdesk.kayako.com/agent/conversations/${ticketIdText}`;
      link.textContent = ticketIdText;
      link.className = 'zendesk-link';
      link.style.color = '#0052CC';
      link.style.textDecoration = 'underline';
      link.target = '_blank';
      link.title = "Open in Kayako";
      
      // Replace only the text node with our link
      replaceTextWithLink(valueElement, ticketIdText, link);
    }
  });
}

// Run the function after a short delay to ensure the page is loaded
setTimeout(convertZendeskIdsToLinks, 1000);

// Set up a mutation observer to handle dynamically loaded content
const observer = new MutationObserver(function() {
  setTimeout(convertZendeskIdsToLinks, 500);
});

// Start observing the document with the configured parameters
observer.observe(document.body, { 
  childList: true,
  subtree: true
});

// Re-run on page navigation events
window.addEventListener('popstate', () => {
  setTimeout(convertZendeskIdsToLinks, 1000);
});

window.addEventListener('pushstate', () => {
  setTimeout(convertZendeskIdsToLinks, 1000);
});

window.addEventListener('replacestate', () => {
  setTimeout(convertZendeskIdsToLinks, 1000);
}); 