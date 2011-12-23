/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

const IMEManager = {
  BASIC_LAYOUT: -1,
  ALTERNATE_LAYOUT: -2,
  SWITCH_KEYBOARD: -3,

  // TBD: allow user to select desired keyboards in settings
  keyboards: [
    'qwertyLayout', 'azertyLayout', 'qwertzLayout', 'hebrewLayout',
    'jcukenLayout', 'serbianCyrillicLayout', 'dvorakLayout',
    'zhuyingGeneralLayout'
  ],
  IMEngines: {},

  // backspace repeat delay and repeat rate
  kRepeatDelay: 700,
  kRepeatRate: 100,

  get ime() {
    delete this.ime;
    return this.ime = document.getElementById('keyboard');
  },

  events: ['showime', 'hideime', 'unload', 'appclose'],
  init: function km_init() {
    this.events.forEach((function attachEvents(type) {
      window.addEventListener(type, this);
    }).bind(this));

    this.ime.addEventListener('touchstart', this);
    this.ime.addEventListener('touchend', this);
    this.ime.addEventListener('click', this);

    this.layout = KeyboardAndroid[IMEManager.keyboards[0]];
    this.currentKeyboard = 0;
    this.isUpperCase = false;

    this.selectionEl = document.createElement('div');
    this.selectionEl.id = 'keyboard-selections';

    var self = this;
    IMEManager.keyboards.forEach(function loadIMEngines(keyboard) {
      if (KeyboardAndroid[keyboard].type !== 'ime')
        return;

      var imEngine = KeyboardAndroid[keyboard].imEngine;
      var imPath = './imes/' + imEngine;

      var script = document.createElement('script');
      script.addEventListener('load',function IMEnginesLoaded() {
        var engine = IMEManager.IMEngines[imEngine];
        function sendChoices() {
          self.showSelections.apply(self, arguments);
        }

        function sendKey(key) {
          window.navigator.mozKeyboard.sendKey(key);
        }

        function sendString(str) {
          for (var i = 0; i < str.length; i++)
            window.navigator.mozKeyboard.sendKey(str.charCodeAt(i));
        }
        engine.init(imPath, sendChoices, sendKey, sendString);
      });
      script.src = imPath + '/loader.js';
      document.body.appendChild(script);
    });
  },

  uninit: function km_uninit() {
    this.events.forEach((function attachEvents(type) {
      window.removeEventListener(type, this);
    }).bind(this));

    this.ime.removeEventListener('touchstart', this);
    this.ime.removeEventListener('touchend', this);
    this.ime.removeEventListener('click', this);
  },
  handleEvent: function km_handleEvent(evt) {
    var activeWindow = Gaia.AppManager.foregroundWindow,
    self = this;

    switch (evt.type) {
      case 'showime':
        this.showIME(activeWindow, evt.detail.type);
        break;
      case 'hideime':
      case 'appclose':
        this.hideIME(activeWindow);
        break;
      case 'touchstart':
        var keyCode = parseInt(evt.target.getAttribute('data-keycode'));
        if (!keyCode)
          return;
        evt.target.dataset.active = 'true';
        if (keyCode === KeyEvent.DOM_VK_BACK_SPACE) {
          if (this.layout.type === 'ime')
            this.IMEngines[this.layout.imEngine].click(keyCode);
          else
            window.navigator.mozKeyboard.sendKey(keyCode);
          var self = this;
          this._timer = setTimeout(
            function km_backspaceDelay() {
              if (self.layout.type === 'ime')
                self.IMEngines[self.layout.imEngine].click(keyCode);
              else
                window.navigator.mozKeyboard.sendKey(keyCode);
              self._timer = setInterval(
                function km_backspaceRepeat() {
                  if (self.layout.type === 'ime')
                    self.IMEngines[self.layout.imEngine].click(keyCode);
                  else
                    window.navigator.mozKeyboard.sendKey(keyCode);
                },
                IMEManager.kRepeatRate
              );
            },
            IMEManager.kRepeatDelay
          );
        }
        break;
      case 'touchend':
        var keyCode = parseInt(evt.target.getAttribute('data-keycode'));
        if (!keyCode)
          return;
        delete evt.target.dataset.active;
        clearTimeout(this._timer);
        clearInterval(this._timer);
        delete this._timer;
        break;
      case 'click':
        if (evt.target.dataset.selection) {
          this.IMEngines[this.layout.imEngine].select(
            evt.target.textContent,
            evt.target.dataset.data
          );
          this.updateKeyboardHeight();
          return;
        }

        var keyCode = parseInt(evt.target.getAttribute('data-keycode'));
        if (!keyCode && keyCode === KeyEvent.DOM_VK_BACK_SPACE)
          return;

        switch (keyCode) {
          case IMEManager.BASIC_LAYOUT:
            var keyboard = IMEManager.keyboards[this.currentKeyboard];
            this.layout = KeyboardAndroid[keyboard];
            this.updateLayout();
            this.updateKeyboardHeight();
          break;
          case IMEManager.ALTERNATE_LAYOUT:
            this.layout = KeyboardAndroid.alternateLayout;
            this.updateLayout();
            this.updateKeyboardHeight();
          break;
          case IMEManager.SWITCH_KEYBOARD:
            this.currentKeyboard++;
            if (this.currentKeyboard === IMEManager.keyboards.length)
              this.currentKeyboard = 0;
            var keyboard = IMEManager.keyboards[this.currentKeyboard];
            this.layout = KeyboardAndroid[keyboard];
            this.updateLayout();
            this.updateKeyboardHeight();
          break;
          case KeyEvent.DOM_VK_CAPS_LOCK:
            var keyboard = IMEManager.keyboards[this.currentKeyboard];
            if (this.isUpperCase) {
              this.layout = KeyboardAndroid[keyboard];
            } else {
              this.layout = KeyboardAndroid[keyboard + 'UpperCaps'];
            }
            this.isUpperCase = !this.isUpperCase;
            this.updateLayout();
            //this.updateKeyboardHeight();
          break;
          default:
            if (this.layout.type === 'ime') {
              this.IMEngines[this.layout.imEngine].click(keyCode);
              this.updateKeyboardHeight();
              break;
            }
            window.navigator.mozKeyboard.sendKey(keyCode);
            if (this.isUpperCase) {
              this.isUpperCase = !this.isUpperCase;
              var keyboard = IMEManager.keyboards[this.currentKeyboard];
              this.layout = KeyboardAndroid[keyboard];
              this.updateLayout();
              //this.updateKeyboardHeight();
            }
          break;
        }
        break;
      case 'unload':
        this.uninit();
        break;
    }
  },
  updateLayout: function km_updateLayout() {
    var content = '', width = window.innerWidth, self = this;
    this.layout.keys.forEach(function buildKeyboardRow(row) {
      content += '<div class="keyboard-row">';

      row.forEach(function buildKeyboardColumns(key) {
        var code = key.keyCode || key.value.charCodeAt(0);
        var size = ((width - (row.length * 2)) / (self.layout.width || 10));
        size = size * (key.ratio || 1) - 2;
        content += '<span class="keyboard-key"' +
                          'data-keycode="' + code + '"' +
                          'style="width:' + size + 'px"' +
                   '>' +
                   key.value +
                   '</span>';
      });
      content += '</div>';
    });

    this.ime.innerHTML = content;

    if (this.layout.selector) {
      this.ime.insertBefore(
        this.selectionEl,
        this.ime.firstChild
      );
      this.showSelections([]);
      this.IMEngines[this.layout.imEngine].empty();
    }
  },
  updateKeyboardHeight: function km_updateKeyboardHeight() {
    var newHeight = this.targetWindow.dataset.rectHeight -
                    this.ime.getBoundingClientRect().height;
    var ime = this.ime, targetWindow = this.targetWindow;
    if (ime.getBoundingClientRect().top < window.innerHeight) {
      this.targetWindow.style.height = newHeight + 'px';
      return;
    }

    ime.addEventListener('transitionend', function imeShow(evt) {
      ime.removeEventListener('transitionend', imeShow);
      targetWindow.style.height = newHeight + 'px';
    });
  },
  showIME: function km_showIME(targetWindow, type) {
    var oldHeight = targetWindow.style.height;
    targetWindow.dataset.cssHeight = oldHeight;
    targetWindow.dataset.rectHeight =
      targetWindow.getBoundingClientRect().height;

    var ime = this.ime;
    this.updateLayout();
    this.targetWindow = targetWindow;
    this.updateKeyboardHeight();

    delete ime.dataset.hidden;
  },
  hideIME: function km_hideIME(targetWindow) {
    targetWindow.style.height = targetWindow.dataset.cssHeight;
    delete targetWindow.dataset.cssHeight;
    delete targetWindow.dataset.rectHeight;
    delete this.targetWindow;

    var ime = this.ime;
    ime.dataset.hidden = 'true';
    ime.innerHTML = '';
  },
  showSelections: function km_showSelections(selections) {
    // TBD: selection panel should be allow toggled to fullscreen
    var self = this;
    while (this.selectionEl.firstChild) {
      this.selectionEl.removeChild(this.selectionEl.firstChild);
    }
    if (!selections.length) {
      this.selectionEl.className = '';
      return;
    } else {
      this.selectionEl.className = 'show';
      selections.forEach(
        function buildSelection(selection) {
          var span = document.createElement('span');
          span.dataset.data = selection[1];
          span.dataset.selection = true;
          span.textContent = selection[0];
          self.selectionEl.appendChild(span);
        }
      );
    }
  }
};

window.addEventListener('load', function initIMEManager(evt) {
  window.removeEventListener('load', initIMEManager);
  IMEManager.init();
});

