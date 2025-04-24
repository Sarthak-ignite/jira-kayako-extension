// Configuration
const KAYAKO_BASE_URL = "https://central-supportdesk.kayako.com/agent/conversations/";
const MSO_ZENDESK_BASE_URL = "https://mso-portal.zendesk.com/agent/tickets/";
const TARGET_LABEL_TEXT = "Central Zendesk Ticket IDs";
const MSO_ZENDESK_LABEL_TEXT = "MSO Zendesk IDs";
const MIN_TICKET_ID_LENGTH = 5; // Minimum expected length for a ticket ID
const DEBOUNCE_DELAY = 500; // Delay in ms for MutationObserver and event listeners

let debounceTimer;

// --- Core Logic ---

/**
 * Finds elements containing the target label text and processes their corresponding value containers.
 */
function findAndProcessTicketFields() {
  console.log("Kayako Linker: Searching for ticket fields...");
  const processedContainersThisRun = new Set(); // Track containers processed in this specific execution

  // Function to process a found value container
  const processContainer = (container, type) => {
    if (container && !container.dataset.kayakoProcessed && !processedContainersThisRun.has(container)) {
      console.log(`Kayako Linker: Processing container for ${type} - Container:`, container);
      processTicketValueContainer(container, type);
      container.dataset.kayakoProcessed = 'true'; // Mark for future runs/observers
      processedContainersThisRun.add(container); // Mark as processed for *this* run
      return true; // Indicate processing occurred
    } else if (container && (container.dataset.kayakoProcessed || processedContainersThisRun.has(container))) {
      console.log(`Kayako Linker: Skipping already processed container for ${type} - Container:`, container);
    }
    return false; // Indicate no processing occurred
  };

  // --- Strategy 1: Specific Selectors (Primary approach) ---
  console.log("Kayako Linker: Running specific selector search...");
  const specificLabelSelectors = [
    '[data-test-id="issue.views.field.rich-text.label"]',
    '[data-test-id="issue.field.label"]'
    // Add other specific label selectors if discovered
  ];
  const potentialLabels = document.querySelectorAll(specificLabelSelectors.join(', '));
  const labelsToProcess = [];
  console.log(`Kayako Linker: Found ${potentialLabels.length} potential elements matching specific selectors.`);

  potentialLabels.forEach(labelElement => {
    const labelText = labelElement.textContent?.trim(); // Trim whitespace
    console.log(`Kayako Linker: Checking specific element:`, labelElement, `Text: "${labelText}"`);
    if (labelText) {
      let labelType = null;
      if (labelText.includes(TARGET_LABEL_TEXT)) {
        labelType = 'central';
      } else if (labelText.includes(MSO_ZENDESK_LABEL_TEXT)) {
        labelType = 'mso';
      }
      if (labelType) {
          console.log(`---> Kayako Linker: Found ${labelType} label (specific selector):`, labelElement);
          labelsToProcess.push({ element: labelElement, type: labelType, method: 'specific' });
      } else {
          // console.log(`Specific element text did not match target labels.`);
      }
    } else {
        // console.log(`Specific element has no text content.`);
    }
  });

  // --- Strategy 2: Fallback Search (Only if specific selectors might have missed some) ---
  console.log("Kayako Linker: Running fallback text search for labels...");
  const MAX_FALLBACK_CHILDREN = 50; // Heuristic: Don't check elements with too many children
  const allElements = document.querySelectorAll('div, span, label, th, td, p'); // More targeted elements
  console.log(`Kayako Linker: Checking ${allElements.length} elements in fallback search.`);

  for (const element of allElements) {
      // Avoid elements that are known containers or already processed elements or too large
      if (element.matches('[data-test-id="issue.field.value"], [data-test-id="issue.views.field.rich-text.rich-text-body"]') || element.closest('[data-kayako-processed]') || element.children.length > MAX_FALLBACK_CHILDREN) {
          continue;
      }

      // Also skip elements already identified by specific selectors
      const alreadyProcessedLabel = labelsToProcess.some(l => l.element === element);
      if (alreadyProcessedLabel) {
          continue;
      }

      const elementText = element.textContent?.trim();
      if (elementText) {
          let labelType = null;
          // Use exact match or very close match for fallback text
          if (elementText === TARGET_LABEL_TEXT) {
              labelType = 'central';
          } else if (elementText === MSO_ZENDESK_LABEL_TEXT) {
              labelType = 'mso';
          }

          if (labelType) {
              // Check if we already found this label via specific selector to avoid duplicates
              // (Redundant check due to `alreadyProcessedLabel` above, but safe to keep)
              const alreadyFound = labelsToProcess.some(l => l.element === element || l.element.contains(element) || element.contains(l.element));
              if (!alreadyFound) {
                  console.log(`---> Kayako Linker: Found ${labelType} label (fallback text search):`, element);
                  labelsToProcess.push({ element: element, type: labelType, method: 'fallback' });
              }
          }
      }
  }

  // --- Process all identified labels ---
  console.log(`Kayako Linker: Processing ${labelsToProcess.length} unique labels found.`);
  labelsToProcess.forEach(labelInfo => {
      const { element: labelElement, type: expectedType, method } = labelInfo;
      console.log(`Kayako Linker: Attempting to find and process value for ${expectedType} label (Method: ${method}):`, labelElement);

      // Attempt 1: Use the reliable associated container finder
      let valueContainer = findAssociatedValueContainer(labelElement);
      console.log(`Kayako Linker: Result from findAssociatedValueContainer for ${expectedType}:`, valueContainer);
      if (processContainer(valueContainer, expectedType)) {
          console.log(`Kayako Linker: Successfully processed via findAssociatedValueContainer for ${expectedType}.`);
          return; // Successfully processed, move to next label
      }

      // Attempt 2: If the first failed, try finding the nearest unprocessed container
      console.log(`Kayako Linker: findAssociatedValueContainer failed or container already processed for ${expectedType}. Trying findNearestUnprocessedValue...`);
      valueContainer = findNearestUnprocessedValue(labelElement, processedContainersThisRun);
       console.log(`Kayako Linker: Result from findNearestUnprocessedValue for ${expectedType}:`, valueContainer);
      if (processContainer(valueContainer, expectedType)) {
          console.log(`Kayako Linker: Successfully processed via findNearestUnprocessedValue for ${expectedType}.`);
      } else {
           console.log(`Kayako Linker: Both association methods failed or container already processed for ${expectedType} label:`, labelElement);
      }
  });

  console.log("Kayako Linker: Field processing complete for this run.");
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
 * Finds the nearest potential value container to a given label element,
 * prioritizing common Jira value selectors and excluding already processed elements.
 * @param {HTMLElement} labelElement - The element containing the label text.
 * @param {Set<HTMLElement>} processedContainersThisRun - Set of containers already processed in the current run.
 * @returns {HTMLElement|null} The nearest unprocessed value container or null.
 */
function findNearestUnprocessedValue(labelElement, processedContainersThisRun) {
   console.log("Kayako Linker: Running findNearestUnprocessedValue for label:", labelElement);
   const potentialSelectors = [
       '[data-test-id="issue.field.value"]',
       '[data-test-id="issue.views.field.rich-text.rich-text-body"]'
       // Add other potential value container selectors if needed
   ];
   let closestElement = null;
   let minDistance = Infinity;
   // Increased max distance slightly, but keep it reasonable
   const MAX_DISTANCE = 7;

   potentialSelectors.forEach(selector => {
       const candidates = document.querySelectorAll(selector);
       candidates.forEach(candidate => {
           // Skip if already processed in this run or marked globally
           if (processedContainersThisRun.has(candidate) || candidate.dataset.kayakoProcessed) {
                // console.log("Skipping already processed candidate:", candidate);
               return;
           }

           const distance = getDomDistance(labelElement, candidate);
           // console.log(`Distance between label and candidate ${selector}: ${distance}`, candidate);
           if (distance !== -1 && distance < minDistance && distance <= MAX_DISTANCE) { // Check distance threshold
               console.log(`---> New closest candidate found (distance: ${distance}):`, candidate);
               minDistance = distance;
               closestElement = candidate;
           }
       });
   });

    if (closestElement) {
      console.log(`Kayako Linker: findNearestUnprocessedValue determined closest element at distance ${minDistance}:`, closestElement);
    } else {
      console.log(`Kayako Linker: findNearestUnprocessedValue did not find a suitable close unprocessed element.`);
       // Fallback to simple sibling check ONLY if specific selectors fail
       let sibling = labelElement.nextElementSibling;
       if (sibling && !processedContainersThisRun.has(sibling) && !sibling.dataset.kayakoProcessed && sibling.textContent?.trim().match(/\d{${MIN_TICKET_ID_LENGTH},}/)) {
            const siblingDistance = getDomDistance(labelElement, sibling);
            if (siblingDistance <= 2) { // Only consider very close siblings
                console.log(`Kayako Linker: Using close sibling as fallback value container (distance ${siblingDistance}):`, sibling);
                return sibling;
            }
       }
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
 * @param {string} type - The type of ticket ('central' or 'mso').
 */
function processTicketValueContainer(container, type) {
  console.log(`Kayako Linker: Processing ${type} ticket container`);
  
  // Safety check for type
  if (type !== 'central' && type !== 'mso') {
    console.error(`Kayako Linker: Invalid ticket type: ${type}`);
    return;
  }
  
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
     console.log(`Kayako Linker: Processing text node for ${type} ticket: "${textContent.trim()}"`);
     
     const fragment = document.createDocumentFragment();
     let lastIndex = 0;
     let match;
     let changesMade = false;

     // Find all matches for the regex in the text node
     while ((match = ticketIdRegex.exec(textContent)) !== null) {
        const ticketId = match[1]; // The captured number group (the ID)
        const index = match.index; // Start index of the match
        console.log(`Kayako Linker: Found ${type} ticket ID: ${ticketId}`);

        // Append the text chunk before this match
        if (index > lastIndex) {
            fragment.appendChild(document.createTextNode(textContent.substring(lastIndex, index)));
        }

        // Create the appropriate link based on the ticket type
        const link = document.createElement('a');
        
        // Set link properties based on ticket type
        if (type === 'central') {
          link.href = `${KAYAKO_BASE_URL}${ticketId}`;
          link.title = `Open Kayako Ticket ${ticketId}`;
          link.className = 'kayako-link';
          console.log(`Kayako Linker: Central link URL: ${link.href}`);
        } else if (type === 'mso') {
          link.href = `${MSO_ZENDESK_BASE_URL}${ticketId}`;
          link.title = `Open MSO Zendesk Ticket ${ticketId}`;
          link.className = 'mso-zendesk-link';
          console.log(`Kayako Linker: MSO link URL: ${link.href}`);
        }
        
        // Set common link properties
        link.textContent = ticketId;
        link.style.color = '#0052CC'; // Standard Jira link color
        link.style.textDecoration = 'underline';
        link.target = '_blank';
        link.dataset.ticketType = type; // Add data attribute for debugging
        link.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent Jira's potential click handlers
          console.log(`Kayako Linker: Link clicked - type: ${type}, URL: ${link.href}`);
        });
        
        // Add to fragment
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
        console.log(`Kayako Linker: Created links for ${type} tickets`);
        textNode.parentNode.replaceChild(fragment, textNode);
     }
  });
}

/**
 * Creates an anchor element linking to a ticket.
 * @param {string} ticketId - The ticket ID.
 * @param {string} type - The type of ticket ('central' or 'mso').
 * @returns {HTMLAnchorElement} The created link element.
 */
function createTicketLink(ticketId, type) {
  // This function is no longer used - all link creation happens directly in processTicketValueContainer
  console.warn("Kayako Linker: createTicketLink is deprecated and should not be called directly");
  
  const link = document.createElement('a');
  
  console.log(`Kayako Linker: Creating link for ${type} ticket with ID ${ticketId}`);
  
  if (type === 'central') {
    link.href = `${KAYAKO_BASE_URL}${ticketId}`;
    link.title = `Open Kayako Ticket ${ticketId}`;
    link.className = 'kayako-link';
    console.log(`Kayako Linker: Central link created - ${link.href}`);
  } else if (type === 'mso') {
    link.href = `${MSO_ZENDESK_BASE_URL}${ticketId}`;
    link.title = `Open MSO Zendesk Ticket ${ticketId}`;
    link.className = 'mso-zendesk-link';
    console.log(`Kayako Linker: MSO link created - ${link.href}`);
  }
  
  link.textContent = ticketId;
  link.style.color = '#0052CC'; // Standard Jira link color
  link.style.textDecoration = 'underline';
  link.target = '_blank';
  link.dataset.ticketType = type; // Add data attribute for debugging
  link.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent Jira's potential click handlers on the container
    console.log(`Kayako Linker: Link clicked - type: ${type}, URL: ${link.href}`);
  });
  
  return link;
}

// --- Initialization and Event Handling ---

/**
 * Debounced version of the main processing function.
 */
function debouncedProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log("-----------------------------------------");
    console.log("Kayako Linker: Debounced Check Triggered");
    console.log("-----------------------------------------");
    // Clear processed markers from PREVIOUS runs before re-running
    document.querySelectorAll('[data-kayako-processed]').forEach(el => {
      // console.log("Clearing kayakoProcessed marker from:", el);
      el.removeAttribute('data-kayako-processed');
    });
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

console.log("Kayako and MSO Zendesk Ticket Linker initialized."); 