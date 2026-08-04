export const RECORDER_CONSOLE_PREFIX = '__OC_RECORD__'

/**
 * Installed in the main frame of the browser webview. The active flag lets the host pause
 * capture without accumulating page values in DevTools between recording sessions.
 */
export const RECORDER_SCRIPT = String.raw`
(function(prefix) {
  if (window.__ocRecorderInstalled) {
    window.__ocRecorderActive = true
    return
  }

  window.__ocRecorderInstalled = true
  window.__ocRecorderActive = true

  var reportedContentEditables = new WeakSet()

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  }

  function emit(payload) {
    if (!window.__ocRecorderActive) return
    try {
      console.log(prefix + JSON.stringify(payload))
    } catch (_) {
      // A page replacing console.log must not affect its own interaction flow.
    }
  }

  function attributeSelector(attribute, value) {
    var escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return '[' + attribute + '="' + escaped + '"]'
  }

  function isUnique(selector, element) {
    try {
      var matches = document.querySelectorAll(selector)
      return matches.length === 1 && matches[0] === element
    } catch (_) {
      return false
    }
  }

  function visibleText(element) {
    var text = normalizeText(element.textContent)
    if (!text && element instanceof HTMLInputElement) {
      var type = (element.type || '').toLowerCase()
      if (type === 'button' || type === 'submit') text = normalizeText(element.value)
    }
    return text
  }

  function hintText(element) {
    return visibleText(element) || normalizeText(element.getAttribute('aria-label'))
  }

  function uniqueTextSelector(element) {
    var tag = element.tagName.toLowerCase()
    var role = element.getAttribute('role')
    var supportsText = tag === 'button' || tag === 'a' || role === 'button' || role === 'link'
    var text = visibleText(element)
    if (!supportsText || !text) return null

    var candidates = document.querySelectorAll('button, a, [role="button"], [role="link"]')
    var matches = 0
    for (var i = 0; i < candidates.length; i++) {
      if (visibleText(candidates[i]).includes(text)) matches += 1
    }
    return matches === 1 ? 'text=' + text : null
  }

  function cssPath(element) {
    var parts = []
    var current = element
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      var tag = current.tagName.toLowerCase()
      if (tag === 'html') {
        parts.unshift('html')
        break
      }

      var parent = current.parentElement
      if (parent) {
        var sameTag = Array.prototype.filter.call(parent.children, function(child) {
          return child.tagName === current.tagName
        })
        if (sameTag.length > 1) {
          tag += ':nth-of-type(' + (sameTag.indexOf(current) + 1) + ')'
        }
      }
      parts.unshift(tag)
      current = parent
    }
    return parts.join(' > ')
  }

  function selectorFor(element) {
    if (element.id) {
      var idSelector = '#' + CSS.escape(element.id)
      if (isUnique(idSelector, element)) return idSelector
    }

    var attributes = ['data-testid', 'name', 'aria-label']
    for (var i = 0; i < attributes.length; i++) {
      var value = element.getAttribute(attributes[i])
      if (!value) continue
      var candidate = attributeSelector(attributes[i], value)
      if (isUnique(candidate, element)) return candidate
    }

    var textSelector = uniqueTextSelector(element)
    if (textSelector) return textSelector
    return cssPath(element)
  }

  function reportUnsupported(element, reason) {
    emit({
      kind: 'unsupported',
      reason: reason,
      tag: element && element.tagName ? element.tagName.toLowerCase() : '',
      pageUrl: location.href
    })
  }

  document.addEventListener('click', function(event) {
    if (!(event.target instanceof Element)) return

    var editable = event.target.closest('[contenteditable]:not([contenteditable="false"])')
    if (editable) {
      if (!reportedContentEditables.has(editable)) {
        reportedContentEditables.add(editable)
        reportUnsupported(editable, 'contenteditable')
      }
      return
    }

    var interactive = event.target.closest(
      'button, a, input, textarea, select, [role="button"], [role="link"], [onclick]'
    )
    var element = interactive || event.target
    emit({
      kind: 'click',
      selector: selectorFor(element),
      tag: element.tagName.toLowerCase(),
      text: hintText(element),
      pageUrl: location.href
    })
  }, true)

  document.addEventListener('change', function(event) {
    var element = event.target
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) return

    var value = element instanceof HTMLInputElement && element.type.toLowerCase() === 'password'
      ? '{{PASSWORD}}'
      : element.value
    emit({
      kind: 'change',
      selector: selectorFor(element),
      value: value,
      tag: element.tagName.toLowerCase(),
      pageUrl: location.href
    })
  }, true)

  document.addEventListener('input', function(event) {
    if (!(event.target instanceof Element)) return
    var editable = event.target.closest('[contenteditable]:not([contenteditable="false"])')
    if (!editable || reportedContentEditables.has(editable)) return
    reportedContentEditables.add(editable)
    reportUnsupported(editable, 'contenteditable')
  }, true)

  window.addEventListener('blur', function() {
    setTimeout(function() {
      var active = document.activeElement
      if (active && active.tagName === 'IFRAME') reportUnsupported(active, 'iframe')
    }, 0)
  }, true)
})(${JSON.stringify(RECORDER_CONSOLE_PREFIX)})
`
