// Configuration
const KAYAKO_BASE_URL = "https://central-supportdesk.kayako.com/agent/conversations/";
const TARGET_LABEL_TEXT = "Central Zendesk Ticket IDs";
const MIN_TICKET_ID_LENGTH = 5; // Minimum expected length for a ticket ID
const DEBOUNCE_DELAY = 500; // Delay in ms for MutationObserver and event listeners

let debounceTimer;

// --- Core Logic ---

/**
 * Finds elements containing the target label text and processes their corresponding value containers.
 */
function findAndProcessTicketFields() {
  // Combine selectors for potentially relevant fields (main content and sidebar)
  const potentialFields = document.querySelectorAll(
    '[data-test-id="issue.views.field.rich-text.label"], [data-test-id="issue.field.label"]'
  );

  potentialFields.forEach(labelElement => {
    if (labelElement.textContent && labelElement.textContent.includes(TARGET_LABEL_TEXT)) {
      const valueContainer = findAssociatedValueContainer(labelElement);
      if (valueContainer && !valueContainer.dataset.kayakoProcessed) {
        processTicketValueContainer(valueContainer);
        valueContainer.dataset.kayakoProcessed = 'true'; // Mark as processed
      }
    }
  });

  // Fallback: Generic search for the label text if specific selectors fail
  // This is less efficient but provides wider compatibility if Jira structure changes.
  const allElements = document.querySelectorAll('*:not(script):not(style)');
  for (const element of allElements) {
    if (element.textContent && element.textContent.includes(TARGET_LABEL_TEXT)) {
       // Attempt to find a nearby value container that hasn't been processed
       const valueContainer = findNearestUnprocessedValue(element);
       if (valueContainer) {
         processTicketValueContainer(valueContainer);
         valueContainer.dataset.kayakoProcessed = 'true'; // Mark as processed
       }
    }
  }
}

/**
 * Attempts to find the container holding the value associated with a label element.
 * This function contains heuristics based on common Jira structures.
 * @param {HTMLElement} labelElement
 * @returns {HTMLElement|null} The value container element or null if not found.
 */
function findAssociatedValueContainer(labelElement) {
  // Strategy 1: Look for specific data-test-ids within a common parent
  let commonAncestor = labelElement.closest('[data-test-id^="issue.views.field"]'); // Common ancestor for many field types
  if (!commonAncestor) {
     commonAncestor = labelElement.closest('[data-test-id="issue.views.issue-base.content"]'); // Another common ancestor
  }
   if (!commonAncestor) {
     commonAncestor = labelElement.closest('[data-test-id="issue.views.field.base"]'); // Sidebar fields
  }

  if (commonAncestor) {
    // Look for known value containers within this ancestor
    let valueContainer = commonAncestor.querySelector('[data-test-id="issue.views.field.rich-text.rich-text-body"]');
    if (valueContainer) return valueContainer;

    valueContainer = commonAncestor.querySelector('[data-test-id="issue.field.value"]');
    if (valueContainer) return valueContainer;
  }

  // Strategy 2: Simple sibling check (less reliable but might catch some cases)
  if (labelElement.nextElementSibling) {
     // Basic check if the sibling looks like a value (e.g., contains numbers)
     if (labelElement.nextElementSibling.textContent.trim().match(/\d+/)) {
       return labelElement.nextElementSibling;
     }
  }


  return null; // Indicate not found
}


/**
 * Finds the nearest potential value container to a given element,
 * prioritizing common Jira value selectors and unprocessed elements.
 * Used as a fallback when specific label selectors don't work.
 * @param {HTMLElement} element - The element containing the label text.
 * @returns {HTMLElement|null} The nearest unprocessed value container or null.
 */
function findNearestUnprocessedValue(element) {
   const potentialSelectors = [
       '[data-test-id="issue.field.value"]',
       '[data-test-id="issue.views.field.rich-text.rich-text-body"]'
   ];
   let closestElement = null;
   let minDistance = Infinity;

   potentialSelectors.forEach(selector => {
       const candidates = document.querySelectorAll(selector);
       candidates.forEach(candidate => {
           if (candidate.dataset.kayakoProcessed) return; // Skip processed

           const distance = getDomDistance(element, candidate);
           if (distance !== -1 && distance < minDistance) {
               minDistance = distance;
               closestElement = candidate;
           }
       });
   });

   // Consider direct siblings/children as a last resort if specific selectors fail nearby
    if (!closestElement) {
        let el = element.nextElementSibling;
        if (el && !el.dataset.kayakoProcessed && el.textContent.trim().match(/\d+/)) return el;
        el = element.parentElement?.querySelector(':scope > *:not([data-kayako-processed])'); // Check children of parent
         if (el && el !== element && !el.dataset.kayakoProcessed && el.textContent.trim().match(/\d+/)) return el;
    }


   return closestElement;
}

/**
 * Calculates a simple DOM distance (levels up/down). Returns -1 if no common ancestor.
 * @param {HTMLElement} el1
 * @param {HTMLElement} el2
 * @returns {number} Distance or -1.
 */
function getDomDistance(el1, el2) {
    if (el1.contains(el2)) return 0; // Direct descendant

    let commonAncestor = el1;
    let dist1 = 0;
    while(commonAncestor && !commonAncestor.contains(el2)) {
        commonAncestor = commonAncestor.parentElement;
        dist1++;
    }
    if (!commonAncestor) return -1; // No common ancestor

    let dist2 = 0;
    let tempEl2 = el2;
    while (tempEl2 && tempEl2 !== commonAncestor) {
        tempEl2 = tempEl2.parentElement;
        dist2++;
    }

    return dist1 + dist2;
}


/**
 * Processes a container element, finding ticket IDs and replacing them with links.
 * Handles comma-separated IDs and IDs mixed with other text.
 * @param {HTMLElement} container - The element whose text content should be processed.
 */
function processTicketValueContainer(container) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  const nodesToProcess = [];
  // Collect all relevant text nodes first
  while ((node = walker.nextNode())) {
    // Avoid processing text within existing links or empty nodes
    if (node.parentElement.tagName !== 'A' && node.nodeValue.trim()) {
       nodesToProcess.push(node);
    }
  }

  // Regex to find numbers with the minimum required length, using word boundaries
  const ticketIdRegex = new RegExp(`\\b(\\d{${MIN_TICKET_ID_LENGTH},})\\b`, 'g');

  nodesToProcess.forEach(textNode => {
     const textContent = textNode.nodeValue;
     const fragment = document.createDocumentFragment();
     let lastIndex = 0;
     let match;
     let changesMade = false;

     // Find all matches for the regex in the text node
     while ((match = ticketIdRegex.exec(textContent)) !== null) {
        const ticketId = match[1]; // The captured number group (the ID)
        const index = match.index; // Start index of the match

        // Append the text chunk before this match
        if (index > lastIndex) {
            fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)));
        }

        // Create and append the link for the found ID
        const link = createKayakoLink(ticketId);
        fragment.appendChild(link);
        changesMade = true;

        // Update the index for the next iteration
        lastIndex = ticketIdRegex.lastIndex; // End index of the match
     }

     // Append any remaining text after the last match
     if (lastIndex < textContent.length) {
        fragment.appendChild(document.createTextNode(textContent.substring(lastIndex)));
     }

     // Replace the original text node with the fragment only if links were added
     if (changesMade) {
        textNode.parentNode.replaceChild(fragment, textNode);
     }
  });
}


/**
 * Creates an anchor element linking to a Kayako ticket.
 * @param {string} ticketId - The Kayako ticket ID.
 * @returns {HTMLAnchorElement} The created link element.
 */
function createKayakoLink(ticketId) {
  const link = document.createElement('a');
  link.href = `${KAYAKO_BASE_URL}${ticketId}`;
  link.textContent = ticketId;
  link.className = 'kayako-link'; // Use a more specific class name
  link.style.color = '#0052CC'; // Standard Jira link color
  link.style.textDecoration = 'underline';
  link.target = '_blank';
  link.title = `Open Kayako Ticket ${ticketId}`;
  link.addEventListener('click', (e) => e.stopPropagation()); // Prevent Jira's potential click handlers on the container
  return link;
}

// --- Initialization and Event Handling ---

/**
 * Debounced version of the main processing function.
 */
function debouncedProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log("Kayako Linker: Running checks...");
    // Clear processed markers before re-running to handle dynamic updates correctly
    document.querySelectorAll('[data-kayako-processed]').forEach(el => el.removeAttribute('data-kayako-processed'));
    findAndProcessTicketFields();
  }, DEBOUNCE_DELAY);
}

// Initial run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', debouncedProcess);
} else {
    // DOMContentLoaded has already fired
    debouncedProcess();
}


// Set up a mutation observer to handle dynamically loaded content
const observer = new MutationObserver((mutationsList) => {
  // Optional: Check mutations for relevance before triggering debounce
  // For now, trigger on any subtree change for simplicity
  for(const mutation of mutationsList) {
     if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Check if the added nodes or the target of character change are inside an already processed container
          // This avoids re-processing the same container just because its text changed slightly (e.g. by this script)
          let targetElement = mutation.type === 'characterData' ? mutation.target.parentElement : mutation.target;
          if (!targetElement?.closest('[data-kayako-processed]')) {
             debouncedProcess();
             break; // Only need to trigger debounce once per batch of mutations
          }
     }
  }
});

// Start observing the document body for subtree modifications
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true // Observe text changes directly
});

// Re-run on SPA navigation events (Jira uses pushState/popstate)
window.addEventListener('popstate', debouncedProcess);
window.addEventListener('pushState', debouncedProcess); // Note: pushState doesn't have a native event, might need polling or listen to clicks causing navigation
window.addEventListener('replacestate', debouncedProcess); // Less common, but include for completeness

// --- Helper for pushState ---
// Since pushState doesn't fire an event, we can wrap it or listen for clicks
// that might trigger it. A more robust solution might involve observing URL changes.
// For simplicity, relying on MutationObserver is often sufficient for SPA updates.
// Example (Alternative): Listen to clicks on potential navigation links
/*
document.body.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) { // Check if the click is on a link
        // Use a short delay to allow navigation to potentially occur
        setTimeout(debouncedProcess, DEBOUNCE_DELAY + 200);
    }
}, true); // Use capture phase
*/

console.log("Kayako Ticket Linker initialized."); 