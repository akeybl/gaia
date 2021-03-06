/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
'use strict';

var PopupManager = {
  _currentPopup: {},
  _currentOrigin: '',
  _lastDisplayedApp: null,
  _endTimes: 0,
  _startTimes: 0,

  throbber: document.getElementById('popup-throbber'),

  overlay: document.getElementById('dialog-overlay'),

  popupContainer: document.getElementById('popup-container'),

  container: document.getElementById('frame-container'),

  screen: document.getElementById('screen'),

  closeButton: document.getElementById('popup-close'),

  loadingIcon: document.getElementById('statusbar-loading'),

  init: function pm_init() {
    this.title = document.getElementById('popup-title');
    window.addEventListener('mozbrowseropenwindow', this);
    window.addEventListener('mozbrowserclose', this);
    window.addEventListener('appwillclose', this);
    window.addEventListener('appopen', this);
    window.addEventListener('appterminated', this);
    window.addEventListener('home', this);
    window.addEventListener('keyboardhide', this);
    window.addEventListener('keyboardchange', this);
    this.closeButton.addEventListener('click', this);
  },

  _showWait: function pm_showWait() {
    this.loadingIcon.classList.add('popup-loading');
  },

  _hideWait: function pm_hideWait() {
    this.loadingIcon.classList.remove('popup-loading');
  },

  open: function pm_open(name, frame, origin, trusted) {
    // Only one popup per origin at a time.
    // If the popup is being shown, we swap frames.
    if (this._currentPopup[origin]) {
      this.container.removeChild(this._currentPopup[origin]);
      delete this._currentPopup[origin];
    } else if (trusted) {
      // Save the current displayed app in order to show it after closing the
      // popup.
      this._lastDisplayedApp = WindowManager.getDisplayedApp();

      // XXX: The correct approach here should be firing trustdialogshow
      // and trustdialoghide events for WindowManager to handle the visibility,
      // instead of exposing this internal method.

      // Show the homescreen.
      WindowManager.setDisplayedApp(null);
    }

    this.popupContainer.dataset.trusty = trusted;

    // Reset overlay height
    this.setHeight(window.innerHeight - StatusBar.height);

    this._currentPopup[origin] = frame;

    var popup = this._currentPopup[origin];
    var dataset = popup.dataset;
    dataset.frameType = 'popup';
    dataset.frameName = name;
    dataset.frameOrigin = origin;

    this.container.appendChild(popup);

    this.screen.classList.add('popup');

    popup.addEventListener('mozbrowserloadend', this);
    popup.addEventListener('mozbrowserloadstart', this);
    popup.addEventListener('mozbrowserlocationchange', this);
  },

  close: function pm_close(evt, callback) {
    if (evt && (!'frameType' in evt.target.dataset ||
        evt.target.dataset.frameType !== 'popup'))
      return;

    var self = this;
    this.popupContainer.addEventListener('transitionend', function wait(event) {
      self.popupContainer.removeEventListener('transitionend', wait);
      self.screen.classList.remove('popup');
      self.popupContainer.classList.remove('disappearing');
      self.container.removeChild(self._currentPopup[self._currentOrigin]);
      delete self._currentPopup[self._currentOrigin];

      // If the popup was opened as a trusted UI on top of the homescreen
      // we show the last displayed application.
      if (self._lastDisplayedApp) {
        WindowManager.setDisplayedApp(self._lastDisplayedApp);
        self._lastDisplayedApp = null;
      }

      if (callback)
        callback();
    });

    this.popupContainer.classList.add('disappearing');

    // We just removed the focused window leaving the system
    // without any focused window, let's fix this.
    window.focus();
  },

  // Workaround for Bug: 781452
  // - when window.open is called mozbrowserloadstart and mozbrowserloadend
  // are fired two times
  handleLoadStart: function pm_handleLoadStart(evt) {
     this._startTimes++;
     if (this._startTimes > 1) {
      this._showWait();
     }
  },

  // Workaround for Bug: 781452
  // - when window.open is called mozbrowserloadstart and mozbrowserloadend
  // are fired two times
  handleLoadEnd: function pm_handleLoadEnd(evt) {
      this._endTimes++;
      if (this._endTimes > 1) {
        this._hideWait();
      }
  },

  backHandling: function pm_backHandling() {
    if (!this._currentPopup[this._currentOrigin])
      return;

    this.close();
  },

  isVisible: function pm_isVisible() {
    return (this._currentPopup[this._currentOrigin] != null);
  },

  setHeight: function pm_setHeight(height) {
    if (this.isVisible())
      this.overlay.style.height = height + 'px';
  },

  handleEvent: function pm_handleEvent(evt) {
    switch (evt.type) {
      case 'click':
        this.backHandling();
        break;
      case 'mozbrowserloadstart':
        this.throbber.classList.add('loading');
        this.handleLoadStart(evt);
        break;
      case 'mozbrowserloadend':
        this.throbber.classList.remove('loading');
        this.handleLoadEnd(evt);
        break;

      case 'mozbrowserlocationchange':
        evt.target.dataset.url = evt.detail;

      case 'mozbrowseropenwindow':
        var detail = evt.detail;
        var openerType = evt.target.dataset.frameType;
        var openerOrigin = evt.target.dataset.frameOrigin;

        // Only app frame is allowed to launch popup
        if (openerType !== 'window')
          return;

        // <a href="" target="_blank"> links should opened outside the app
        // itself and fire an activity to be opened into a new browser window.
        if (detail.name === '_blank') {
          new MozActivity({ name: 'view',
                          data: { type: 'url', url: detail.url }});
          return;
        }

        this.throbber.classList.remove('loading');
        var popupOrigin = this.getOriginFromUrl(detail.url);
        this.title.textContent = popupOrigin;

        var frame = detail.frameElement;
        frame.dataset.url = detail.url;

        this.open(detail.name, frame, openerOrigin, false);

        break;

      case 'mozbrowserclose':
        this.close(evt);
        break;
      case 'home':
        // Reset overlay height before hiding
        this.setHeight(window.innerHeight - StatusBar.height);
        this.hide(this._currentOrigin);
        break;
      case 'appwillclose':
        if (!this._currentPopup[evt.detail.origin])
          return;

        this.hide(evt.detail.origin);
        break;
      case 'appopen':
        this._currentOrigin = evt.detail.origin;
        this.show();
        break;
      case 'appterminated':
        if (!this._currentPopup[evt.detail.origin])
          return;
        this.close(evt.detail.origin);
        break;
      case 'keyboardchange':
        this.setHeight(window.innerHeight -
          StatusBar.height - evt.detail.height);
        break;
      case 'keyboardhide':
        this.setHeight(window.innerHeight - StatusBar.height);
        break;
    }
  },

  getOriginFromUrl: function pm_getOriginFromUrl(url) {
    return url.split('//')[0] + '//' + url.split('//')[1].split('/')[0];
  },

  getPopupFromOrigin: function pm_getPopupFromOrigin(origin) {
    return this._currentPopup[origin];
  },

  show: function pm_show() {
    if (!this._currentPopup[this._currentOrigin])
      return;

    this.screen.classList.add('popup');
    this._currentPopup[this._currentOrigin].hidden = false;
  },

  hide: function pm_hide(origin) {
    if (!this._currentPopup[origin])
      return;

    this.screen.classList.remove('popup');
    this._currentPopup[origin].hidden = true;
  }
};

PopupManager.init();
