(function () {
  'use strict';
  var native = window.CleanTV;
  var apps = [];
  var panel = document.getElementById('panel');
  var search = document.getElementById('search');
  var dock = document.getElementById('dock');
  var appGrid = document.getElementById('apps');
  var featured = document.getElementById('featured');
  var slots = Number(localStorage.getItem('slots')) || 4;
  var pins = JSON.parse(localStorage.getItem('pins') || '[]');
  var theme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  var reduced = localStorage.getItem('motion') === 'true';
  var statusTimer;
  var shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
  var order = JSON.parse(localStorage.getItem('appOrder') || '[]');
  var showClock = localStorage.getItem('showClock') !== 'false';
  var showDate = localStorage.getItem('showDate') !== 'false';
  var panelItems = document.getElementById('panel-items');
  var panelTitle = document.getElementById('panel-title');
  var panelAnchor;
  var panelParent;
  var moving = null;
  var hold = null;
  var suppressClick = null;
  var glass = document.getElementById('glass-focus');
  var homeScreen = document.getElementById('home-screen');
  var appsScreen = document.getElementById('apps-screen');
  var homeTab = document.getElementById('home-tab');
  var appsTab = document.getElementById('apps-tab');

  function positionGlass() {
    var active = document.activeElement;
    var visible = active && /^(BUTTON|INPUT)$/.test(active.tagName) && active.offsetWidth;
    glass.classList.toggle('visible', Boolean(visible));
    if (!visible) return;
    var bounds = active.getBoundingClientRect();
    glass.style.transform = 'translate3d(' + (bounds.left - 3) + 'px,' + (bounds.top - 3) + 'px,0)';
    glass.style.width = (bounds.width + 6) + 'px';
    glass.style.height = (bounds.height + 6) + 'px';
  }

  function showScreen(showApps) {
    finishMove();
    homeScreen.hidden = showApps;
    appsScreen.hidden = !showApps;
    homeTab.removeAttribute('aria-current');
    appsTab.removeAttribute('aria-current');
    var tab = showApps ? appsTab : homeTab;
    tab.setAttribute('aria-current', 'page');
    window.scrollTo(0, 0);
    tab.focus();
    positionGlass();
  }
  homeTab.onclick = function () { showScreen(false); };
  appsTab.onclick = function () { showScreen(true); };
  document.addEventListener('focusin', positionGlass);
  document.addEventListener('focusout', function () { requestAnimationFrame(positionGlass); });
  window.addEventListener('resize', positionGlass);
  window.addEventListener('scroll', positionGlass);
  document.body.classList.add('glass-ready');

  window.showStatus = function (message) {
    var status = document.getElementById('status');
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    statusTimer = setTimeout(function () { status.hidden = true; }, 2800);
  };

  function tile(app, area) {
    var button = document.createElement('button');
    button.className = 'tile';
    button.id = area + '-' + app.id;
    button.dataset.app = app.id;
    button.dataset.area = area;
    button.setAttribute('aria-haspopup', 'dialog');
    button.oncontextmenu = function (event) {
      event.preventDefault();
      cancelHold();
      appMenu(button);
    };
    button.onpointerdown = function (event) {
      if (event.button === 0) beginHold(button);
    };
    var art = document.createElement('span');
    art.className = 'art';
    if (app.image) {
      var image = document.createElement('img');
      image.src = app.image;
      image.alt = '';
      art.appendChild(image);
    } else {
      art.textContent = app.name.slice(0, 2).toUpperCase();
    }
    var label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = app.name;
    button.appendChild(art);
    button.appendChild(label);
    button.onfocus = function () { featured.textContent = app.name; };
    button.onclick = function () {
      if (suppressClick === button) { suppressClick = null; return; }
      if (moving && area === "app") { placeApp(app.id); return; }
      if (native) native.launch(app.id);
      else window.showStatus(app.name + ' opens on Android TV');
    };
    return button;
  }

  function orderedIds() {
    return order.filter(function (id) {
      return apps.some(function (app) { return app.id === id; });
    }).concat(apps.map(function (app) { return app.id; }).filter(function (id) {
      return order.indexOf(id) === -1;
    }));
  }

  function render() {
    var previous = document.activeElement.id;
    var byId = Object.create(null);
    apps.forEach(function (app) { byId[app.id] = app; });
    dock.textContent = '';
    appGrid.textContent = '';
    var shortcutGrid = document.getElementById('shortcuts');
    shortcutGrid.textContent = '';
    dock.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    pins.filter(function (id) { return byId[id]; }).slice(0, slots).forEach(function (id) {
      dock.appendChild(tile(byId[id], 'dock'));
    });
    shortcuts.forEach(function (id) {
      if (byId[id] && pins.indexOf(id) < 0) shortcutGrid.appendChild(tile(byId[id], 'home'));
    });
    document.getElementById('home-shortcuts').hidden = !shortcutGrid.children.length;
    if (!dock.children.length) {
      var browse = document.createElement('button');
      browse.textContent = 'Browse apps';
      browse.onclick = function () { showScreen(true); };
      dock.appendChild(browse);
    }
    orderedIds().forEach(function (id) {
      var app = byId[id];
      if (app.name.toLowerCase().indexOf(search.value.toLowerCase()) < 0) return;
      var entry = document.createElement('div');
      entry.className = 'app-entry';
      var button = tile(app, 'app');
      if (moving === id) button.classList.add('moving');
      entry.appendChild(button);
      appGrid.appendChild(entry);
    });
    if (!appGrid.children.length) appGrid.textContent = 'No apps found.';
    var focus = document.getElementById(previous);
    if (focus && focus.offsetWidth) focus.focus();
    positionGlass();
  }

  function finishMove() {
    moving = null;
    document.getElementById('move-help').hidden = true;
    search.disabled = false;
  }

  function placeApp(targetId) {
    var ids = orderedIds();
    var target = ids.indexOf(targetId);
    var source = ids.indexOf(moving);
    if (source >= 0 && target >= 0) {
      ids.splice(source, 1);
      ids.splice(target, 0, moving);
      order = ids;
      localStorage.setItem('appOrder', JSON.stringify(order));
    }
    var moved = moving;
    finishMove();
    render();
    var button = document.getElementById('app-' + moved);
    if (button) button.focus();
  }

  function hidePanel(restoreFocus) {
    panel.hidden = true;
    panelParent = null;
    if (restoreFocus && panelAnchor && panelAnchor.offsetWidth) panelAnchor.focus();
    positionGlass();
  }

  function openPanel(title, anchor, choices, parent) {
    panelAnchor = anchor;
    panelParent = parent;
    panelTitle.textContent = title;
    panelItems.textContent = '';
    choices.forEach(function (choice) {
      var control = document.createElement(typeof choice[1] === 'function' ? 'button' : 'p');
      control.textContent = choice[0];
      if (control.tagName === 'BUTTON') control.onclick = choice[1];
      panelItems.appendChild(control);
    });
    panel.hidden = false;
    var bounds = anchor.getBoundingClientRect();
    var width = panel.offsetWidth;
    var height = panel.offsetHeight;
    panel.style.left = Math.max(12, Math.min(window.innerWidth - width - 12, bounds.right - width)) + 'px';
    panel.style.top = Math.max(12, Math.min(window.innerHeight - height - 12, bounds.bottom + 10)) + 'px';
    panel.querySelector('button').focus();
  }

  function systemAction(action) {
    return function () {
      if (native) native.settings(action);
      else window.showStatus('Available on a compatible Android TV');
    };
  }

  function toggleDock(id) {
    var index = pins.indexOf(id);
    if (index < 0 && pins.length >= slots) {
      window.showStatus('Dock is full');
      return;
    }
    if (index >= 0) {
      pins.splice(index, 1);
      shortcuts = shortcuts.filter(function (item) { return item !== id; });
      localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
    }
    else {
      pins.push(id);
      shortcuts = shortcuts.filter(function (item) { return item !== id; });
      localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
    }
    localStorage.setItem('pins', JSON.stringify(pins));
    hidePanel(false);
    render();
    var target = document.getElementById('app-' + id);
    if (target && target.offsetWidth) target.focus();
    else if (dock.firstElementChild) dock.firstElementChild.focus();
  }

  function toggleHome(id) {
    var index = shortcuts.indexOf(id);
    if (index >= 0) shortcuts.splice(index, 1);
    else shortcuts.push(id);
    localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
    hidePanel(false);
    render();
    var target = document.getElementById('app-' + id);
    if (target && target.offsetWidth) target.focus();
    else homeTab.focus();
  }

  function appMenu(button) {
    if (moving || !panel.hidden) return;
    var id = button.dataset.app;
    var app = apps.filter(function (entry) { return entry.id === id; })[0];
    if (!app) return;
    var inDock = pins.indexOf(id) >= 0;
    var choices = [];
    if (!inDock) choices.push([shortcuts.indexOf(id) < 0 ? 'Add to Home screen' : 'Remove from Home screen', function () { toggleHome(id); }]);
    choices.push([
      inDock ? 'Remove from Dock' : shortcuts.indexOf(id) >= 0 ? 'Move to Dock' : 'Add to Dock',
      function () { toggleDock(id); }
    ]);
    choices.push(
      ['Move in Apps', function () {
        hidePanel(false);
        showScreen(true);
        search.value = '';
        search.disabled = true;
        moving = id;
        document.getElementById('move-help').hidden = false;
        render();
        document.getElementById('app-' + id).focus();
      }],
      ['Back', function () { hidePanel(true); }]
    );
    openPanel(app.name, button, choices);
  }

  function cancelHold() {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }

  function beginHold(button) {
    if (hold || moving || !panel.hidden) return;
    suppressClick = null;
    hold = {timer: setTimeout(function () {
      hold = null;
      suppressClick = button;
      appMenu(button);
    }, 550)};
  }

  function settingsMenu(anchor) {
    function back() { settingsMenu(anchor); }
    function section(title, options) {
      return function () {
        openPanel(title, anchor, options.concat([['Back', back]]), back);
      };
    }
    function appearance() {
      openPanel('Appearance', anchor, [
        ['Theme · ' + (theme === 'dark' ? 'Dark' : 'Light'), function () {
          theme = theme === 'dark' ? 'light' : 'dark';
          localStorage.setItem('theme', theme);
          document.body.dataset.theme = theme;
          this.textContent = 'Theme · ' + (theme === 'dark' ? 'Dark' : 'Light');
        }],
        ['Reduce motion · ' + (reduced ? 'On' : 'Off'), function () {
          reduced = !reduced;
          localStorage.setItem('motion', reduced);
          document.body.classList.toggle('reduced', reduced);
          this.textContent = 'Reduce motion · ' + (reduced ? 'On' : 'Off');
        }],
        ['Clock · ' + (showClock ? 'On' : 'Off'), function () {
          showClock = !showClock;
          localStorage.setItem('showClock', showClock);
          document.getElementById('clock').hidden = !showClock;
          this.textContent = 'Clock · ' + (showClock ? 'On' : 'Off');
        }],
        ['Date · ' + (showDate ? 'On' : 'Off'), function () {
          showDate = !showDate;
          localStorage.setItem('showDate', showDate);
          document.getElementById('date').hidden = !showDate;
          this.textContent = 'Date · ' + (showDate ? 'On' : 'Off');
        }],
        ['Back', back]
      ], back);
    }
    openPanel('Settings', anchor, [
      ['Appearance', appearance],
      ['Dock', section('Dock', [['Dock slots · ' + slots, function () {
        var next = slots === 7 ? 4 : slots + 1;
        if (pins.length > next) {
          window.showStatus('Remove apps before reducing Dock slots');
          return;
        }
        slots = next;
        localStorage.setItem('slots', slots);
        this.textContent = 'Dock slots · ' + slots;
        render();
      }]])],
      ['Home setup', section('Home setup', [
        ['Set CleanTVOS as Home', systemAction('activate')],
        ['Restore Factory Home', systemAction('restore')]
      ])],
      ['Android settings', systemAction('system')],
      ['Back', function () { hidePanel(true); }]
    ]);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (button) {
    button.onclick = function () {
      var kind = button.dataset.panel;
      if (kind === 'settings') { settingsMenu(button); return; }
      var options = {
        inputs: ['Inputs', [['Open TV input controls', systemAction('inputs')]]],
        wifi: ['Wi-Fi', [['Open Wi-Fi settings', systemAction('wifi')], ['Network settings', systemAction('network')]]],
        vpn: ['VPN', [[native && native.vpnConnected() ? 'VPN connected' : 'Open Android settings to manage your VPN.'], ['Open VPN settings', systemAction('vpn')]]]
      }[kind];
      openPanel(options[0], button, options[1].concat([['Back', function () { hidePanel(true); }]]));
    };
  });

  window.closePanel = function () {
    if (!panel.hidden) {
      if (panelParent) panelParent();
      else hidePanel(true);
    } else if (moving) {
      var moved = moving;
      finishMove();
      render();
      var original = document.getElementById('app-' + moved);
      if (original) original.focus();
    } else if (!appsScreen.hidden && search.value) {
      search.value = '';
      render();
    } else if (!appsScreen.hidden) {
      showScreen(false);
    }
  };
  search.oninput = render;
  document.addEventListener('pointerup', cancelHold);
  document.addEventListener('pointercancel', cancelHold);
  window.addEventListener('blur', cancelHold);
  function okKey(event) { return event.key === 'Enter' || event.keyCode === 23; }

  document.addEventListener('keydown', function (event) {
    if (!okKey(event)) return;
    if (event.repeat && (hold || suppressClick)) { event.preventDefault(); return; }
    if (!event.target.dataset.app || moving || !panel.hidden) return;
    event.preventDefault();
    beginHold(event.target);
  });

  document.addEventListener('keyup', function (event) {
    if (!okKey(event)) return;
    if (suppressClick) {
      event.preventDefault();
      suppressClick = null;
      return;
    }
    if (!hold || !event.target.dataset.app) return;
    event.preventDefault();
    cancelHold();
    event.target.click();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      window.closePanel();
      return;
    }
    if (event.key === 'Tab' && !panel.hidden) {
      var controls = panel.querySelectorAll('button');
      var index = Array.prototype.indexOf.call(controls, document.activeElement);
      controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
      event.preventDefault();
      return;
    }
    if ((event.key || '').indexOf('Arrow') !== 0 || (event.target === search && /Left|Right/.test(event.key))) return;
    var scope = panel.hidden ? document : panel;
    var active = document.activeElement;
    var origin = active.getBoundingClientRect();
    var horizontal = /Left|Right/.test(event.key);
    var sign = /Right|Down/.test(event.key) ? 1 : -1;
    var best = null;
    var distance = Infinity;
    Array.prototype.forEach.call(scope.querySelectorAll('button, input'), function (target) {
      if (target === active || !target.offsetWidth || target.disabled || (moving && target.dataset.area !== 'app')) return;
      var rect = target.getBoundingClientRect();
      var x = rect.left + rect.width / 2 - origin.left - origin.width / 2;
      var y = rect.top + rect.height / 2 - origin.top - origin.height / 2;
      var primary = sign * (horizontal ? x : y);
      var cross = Math.abs(horizontal ? y : x);
      if (primary < 5 || (horizontal && cross > 18)) return;
      var score = primary + cross * 2;
      if (score < distance) { distance = score; best = target; }
    });
    event.preventDefault();
    if (best) best.focus();
    else if (active === document.body) scope.querySelector('button').focus();
  });

  function clock() {
    var now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    document.getElementById('date').textContent = now.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
  }
  window.receiveApps = function (list) { apps = list; render(); };
  window.refreshHome = function () {
    if (!native) return;
    native.loadApps();
    var vpn = document.getElementById('vpn');
    var connected = native.vpnConnected();
    vpn.textContent = connected ? 'VPN connected' : 'VPN';
    vpn.classList.toggle('connected', connected);
  };

  document.body.classList.toggle('reduced', reduced);
  document.getElementById('clock').hidden = !showClock;
  document.getElementById('date').hidden = !showDate;
  document.body.dataset.theme = theme;
  clock();
  setInterval(clock, 15000);
  if (native) window.refreshHome();
  else {
    apps = ['YouTube', 'Netflix', 'Prime Video', 'Jellyfin', 'VLC', 'Spotify', 'VPN Client', 'Kodi'].map(function (name, i) {
      return {id: String(i), name: name};
    });
    if (localStorage.getItem('pins') === null) pins = ['0', '1', '3', '6'];
    render();
  }

  homeTab.focus();
}());
