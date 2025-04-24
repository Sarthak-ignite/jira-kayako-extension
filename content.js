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
  const processedContainersThisRun = new Set(); // Track containers processed in this specific execution

  // Function to process a found value container
  const processContainer = (container, type) => {
    if (container && !container.dataset.kayakoProcessed && !processedContainersThisRun.has(container)) {
      processTicketValueContainer(container, type);
      container.dataset.kayakoProcessed = 'true'; // Mark for future runs/observers
      processedContainersThisRun.add(container); // Mark as processed for *this* run
      return true; // Indicate processing occurred
    } else if (container && (container.dataset.kayakoProcessed || processedContainersThisRun.has(container))) {
    }
    return false; // Indicate no processing occurred
  };

  // --- Strategy 1: Specific Selectors (Primary approach) ---
  const specificLabelSelectors = [
    '[data-test-id="issue.views.field.rich-text.label"]',
    '[data-test-id="issue.field.label"]'
    // Add other specific label selectors if discovered
  ];
  const potentialLabels = document.querySelectorAll(specificLabelSelectors.join(', '));
  const labelsToProcess = [];

  potentialLabels.forEach(labelElement => {
    const labelText = labelElement.textContent?.trim(); // Trim whitespace
    if (labelText) {
      let labelType = null;
      if (labelText.includes(TARGET_LABEL_TEXT)) {
        labelType = 'central';
      } else if (labelText.includes(MSO_ZENDESK_LABEL_TEXT)) {
        labelType = 'mso';
      }
      if (labelType) {
          labelsToProcess.push({ element: labelElement, type: labelType, method: 'specific' });
      } else {
      }
    } else {
    }
  });

  // --- Strategy 2: Fallback Search (Only if specific selectors might have missed some) ---
  const MAX_FALLBACK_CHILDREN = 50; // Heuristic: Don't check elements with too many children
  const allElements = document.querySelectorAll('div, span, label, th, td, p'); // More targeted elements

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
                  labelsToProcess.push({ element: element, type: labelType, method: 'fallback' });
              }
          }
      }
  }

  // --- Process all identified labels ---
  labelsToProcess.forEach(labelInfo => {
      const { element: labelElement, type: expectedType, method } = labelInfo;

      // Attempt 1: Use the reliable associated container finder
      let valueContainer = findAssociatedValueContainer(labelElement);
      if (processContainer(valueContainer, expectedType)) {
          return; // Successfully processed, move to next label
      }

      // Attempt 2: If the first failed, try finding the nearest unprocessed container
      valueContainer = findNearestUnprocessedValue(labelElement, processedContainersThisRun);
      if (processContainer(valueContainer, expectedType)) {
      }
  });
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
               return;
           }

           const distance = getDomDistance(labelElement, candidate);
           if (distance !== -1 && distance < minDistance && distance <= MAX_DISTANCE) { // Check distance threshold
               minDistance = distance;
               closestElement = candidate;
           }
       });
   });

    if (closestElement) {
    } else {
       // Fallback to simple sibling check ONLY if specific selectors fail
       let sibling = labelElement.nextElementSibling;
       if (sibling && !processedContainersThisRun.has(sibling) && !sibling.dataset.kayakoProcessed && sibling.textContent?.trim().match(/\d{${MIN_TICKET_ID_LENGTH},}/)) {
            const siblingDistance = getDomDistance(labelElement, sibling);
            if (siblingDistance <= 2) { // Only consider very close siblings
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
  // Safety check for type
  if (type !== 'central' && type !== 'mso') {
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

        // Create the appropriate link based on the ticket type
        const link = document.createElement('a');
        
        // Set link properties based on ticket type
        if (type === 'central') {
          link.href = `${KAYAKO_BASE_URL}${ticketId}`;
          link.title = `Open Kayako Ticket ${ticketId}`;
          link.className = 'kayako-link';
        } else if (type === 'mso') {
          link.href = `${MSO_ZENDESK_BASE_URL}${ticketId}`;
          link.title = `Open MSO Zendesk Ticket ${ticketId}`;
          link.className = 'mso-zendesk-link';
        }
        
        // Set common link properties
        link.textContent = ticketId;
        link.style.color = '#0052CC'; // Standard Jira link color
        link.style.textDecoration = 'underline';
        link.target = '_blank';
        link.dataset.ticketType = type; // Add data attribute for debugging
        link.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent Jira's potential click handlers
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
        textNode.parentNode.replaceChild(fragment, textNode);
     }
  });
}

// --- Initialization and Event Handling ---

/**
 * Debounced version of the main processing function.
 */
function debouncedProcess() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Clear processed markers from PREVIOUS runs before re-running
    document.querySelectorAll('[data-kayako-processed]').forEach(el => {
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

console.log("Kayako and MSO Zendesk Ticket Linker initialized."); 