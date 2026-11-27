(function () {
  'use strict';
  var native = window.CleanTV;
  var apps = [];
  var panel = document.getElementById('panel');
  var search = document.getElementById('search');
  var dock = document.getElementById('dock');
  var appGrid = document.getElementById('apps');
  var featured = document.getElementById('featured');
  var appsColumns = 6;
  var dockLayoutUpdated = localStorage.getItem('sixSlotDock') === 'true';
  var slots = dockLayoutUpdated ? Number(localStorage.getItem('slots')) || 6 : 6;
  var pins = JSON.parse(localStorage.getItem('pins') || '[]');
  var wallpapers = [
    ['default', 'CleanTVOS gradient'],
    ['seto-inland-sea', 'Seto Inland Sea Dusk'],
    ['lavaux', 'Lavaux Golden Hour'],
    ['sossusvlei', 'Sossusvlei Twilight'],
    ['waipoua', 'Waipoua Forest Dusk']
  ];
  var wallpaperRotation = localStorage.getItem('wallpaperRotation') !== 'false';
  var wallpaperTimer;
  var wallpaper = localStorage.getItem('wallpaper');
  if (!wallpaper && wallpaperRotation) wallpaper = wallpapers[1][0];
  if (!wallpapers.some(function (item) { return item[0] === wallpaper; })) wallpaper = 'default';
  var reduced = localStorage.getItem('motion') === 'true';
  var statusTimer;
  var shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
  var order = JSON.parse(localStorage.getItem('appOrder') || '[]');
  var showClock = localStorage.getItem('showClock') !== 'false';
  var use24Hour = localStorage.getItem('clock24') !== 'false';
  var showDate = localStorage.getItem('showDate') !== 'false';
  var panelItems = document.getElementById('panel-items');
  var panelTitle = document.getElementById('panel-title');
  var panelAnchor;
  var panelParent;
  var panelFocusByTitle = Object.create(null);
  var returningToParent = false;
  var moving = null;
  var homeExpanded = false;
  var clippedColumn = null;
  var clippedTile = null;
  var lastAppId = localStorage.getItem('lastAppId');
  var hold = null;
  var suppressClick = null;
  var remoteTileFocused = false;
  var glass = document.getElementById('glass-focus');
  var homeScreen = document.getElementById('home-screen');
  var appsScreen = document.getElementById('apps-screen');
  var homeTab = document.getElementById('home-tab');
  var appsTab = document.getElementById('apps-tab');
  var quickToggle = document.getElementById('quick-toggle');
  var quickMenu = document.getElementById('quick-menu');
  var quickControls = quickToggle.parentElement;

  function setQuickOpen(open) {
    quickMenu.hidden = !open;
    quickControls.classList.toggle('quick-open', open);
    quickToggle.setAttribute('aria-expanded', String(open));
    quickControls.style.width = open ? (quickMenu.offsetWidth + quickToggle.offsetWidth + 8) + 'px' : '';
  }

  quickToggle.onclick = function () {
    var opening = quickMenu.hidden;
    setQuickOpen(opening);
    if (opening) quickMenu.querySelector('button').focus();
    else quickToggle.focus();
  };

  function positionGlass() {
    var active = document.activeElement;
    document.body.classList.toggle('apps-grid-focused', !appsScreen.hidden && appGrid.contains(active));
    var tileFocused = Boolean(active && active.dataset.app && !moving && panel.hidden);
    if (native && tileFocused !== remoteTileFocused) {
      remoteTileFocused = tileFocused;
      native.setAppTileFocused(tileFocused);
    }
    var visible = active && !active.classList.contains('tile') && !quickMenu.contains(active) &&
      /^(BUTTON|INPUT)$/.test(active.tagName) && active.offsetWidth;
    glass.classList.toggle('visible', Boolean(visible));
    if (!visible) return;
    var bounds = active.getBoundingClientRect();

    var width = (active === search ? active.offsetWidth * 1.04 : bounds.width) + 6;
    var height = (active === search ? active.offsetHeight * 1.04 : bounds.height) + 6;
    var left = bounds.left + (bounds.width - width) / 2;
    var top = bounds.top + (bounds.height - height) / 2;
    glass.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
    glass.style.borderRadius = window.getComputedStyle(active).borderRadius;
    glass.style.width = width + 'px';
    glass.style.height = height + 'px';
  }

  function showScreen(showApps) {
    finishMove();
    setQuickOpen(false);
    homeScreen.hidden = showApps;
    clippedColumn = null;
    clippedTile = null;
    setHomeExpanded(false);
    appsScreen.hidden = !showApps;
    document.body.classList.toggle('apps-active', showApps);
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
  document.querySelector('header').addEventListener('transitionend', positionGlass);
  var scrollFrame;
  window.addEventListener('scroll', function () {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(function () {
      scrollFrame = null;
      positionGlass();
    });
  });
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
    var useBanner = app.image;
    var imageSource = useBanner || app.icon;
    if (useBanner) art.classList.add('banner-art');
    if (imageSource) {
      var image = document.createElement('img');
      image.src = imageSource;
      image.alt = '';
      art.appendChild(image);
    } else {
      art.classList.add('placeholder-art');
    }
    button.appendChild(art);
    button.setAttribute('aria-label', app.name);
    button.onfocus = function () {
      if (area !== 'app') {
        featured.textContent = app.name;
      } else if (lastAppId !== app.id) {
        lastAppId = app.id;
        localStorage.setItem('lastAppId', lastAppId);
      }
    };
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
    shortcutGrid.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    dock.style.gridTemplateColumns = 'repeat(' + slots + ',minmax(0,1fr))';
    pins.filter(function (id) { return byId[id]; }).slice(0, slots).forEach(function (id) {
      dock.appendChild(tile(byId[id], 'dock'));
    });
    shortcuts.forEach(function (id) {
      if (byId[id] && pins.indexOf(id) < 0) shortcutGrid.appendChild(tile(byId[id], 'home'));
    });
    var available = apps.filter(function (app) {
      return pins.indexOf(app.id) < 0 && shortcuts.indexOf(app.id) < 0;
    });
    if (available.length) {
      var add = document.createElement('button');
      add.id = 'add-home-app';
      add.className = 'add-home';
      add.textContent = '+';
      add.setAttribute('aria-label', 'Add app to Home screen');
      add.setAttribute('aria-haspopup', 'dialog');
      add.onclick = function () {
        var options = available.map(function (app) {
          return [app.name, function () { toggleHome(app.id); }];
        });
        openPanel('Add to Home screen', add, options);

      };
      shortcutGrid.appendChild(add);
    }
    setHomeExpanded(homeExpanded);
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
      var label = document.createElement('span');
      label.className = 'tile-name';
      label.textContent = app.name;
      label.setAttribute('aria-hidden', 'true');
      entry.appendChild(label);
      appGrid.appendChild(entry);
    });
    if (!appGrid.children.length) appGrid.textContent = 'No apps found.';
    var focus = document.getElementById(previous);
    if (focus && focus.offsetWidth) focus.focus();
    else if (!appsScreen.hidden && panel.hidden && document.activeElement === document.body) {
      var lastTile = document.getElementById('app-' + lastAppId);
      (lastTile || search).focus();
    }
    positionGlass();
  }

  function setHomeExpanded(expand) {
    var section = document.getElementById('home-shortcuts');
    var hasShortcuts = document.getElementById('shortcuts').children.length > 0;
    homeExpanded = expand && hasShortcuts;
    section.hidden = !homeExpanded;
    document.body.classList.toggle('home-expanded', homeExpanded);
  }
  dock.onclick = function (event) {
    if (event.target !== dock) return;
    setHomeExpanded(!homeExpanded);
    if (homeExpanded) document.getElementById('shortcuts').firstElementChild.focus();
    else window.scrollTo(0, 0);
  };

  function navigateHome(key, active) {
    if (!appsScreen.hidden || !panel.hidden || !/^(ArrowUp|ArrowDown)$/.test(key)) return false;
    var down = key === 'ArrowDown';
    var inDock = dock.contains(active);
    var shortcuts = document.getElementById('shortcuts');
    if (inDock && down) {
      setHomeExpanded(true);
      if (homeExpanded) {
        var index = Math.max(0, Array.prototype.indexOf.call(dock.children, active));
        shortcuts.children[Math.min(index, Math.min(slots - 1, shortcuts.children.length - 1))].focus();
      }
      return true;
    }
    if (shortcuts.contains(active) && !down &&
        Array.prototype.indexOf.call(shortcuts.children, active) < slots) {
      var column = Array.prototype.indexOf.call(shortcuts.children, active);
      setHomeExpanded(false);
      dock.children[Math.min(column, dock.children.length - 1)].focus();
      window.scrollTo(0, 0);
      return true;
    }
    if (inDock && !down) {
      setHomeExpanded(false);
      homeTab.focus();
      window.scrollTo(0, 0);
      return true;
    }
    if (down && document.querySelector('header').contains(active) && dock.firstElementChild) {
      setHomeExpanded(false);
      dock.firstElementChild.focus();
      return true;
    }
    return false;
  }

  function focusAppTile(tile) {
    tile.focus({preventScroll: true});
    var viewport = appGrid.getBoundingClientRect();
    var bounds = tile.getBoundingClientRect();
    var caption = tile.nextElementSibling;
    var bottom = caption ? caption.getBoundingClientRect().bottom : bounds.bottom;
    var adjustment = 0;
    if (bounds.top < viewport.top + 10) adjustment = bounds.top - viewport.top - 10;
    else if (bottom > viewport.bottom - 10) adjustment = bottom - viewport.bottom + 10;
    if (adjustment) {
      appGrid.scrollTo({top: appGrid.scrollTop + adjustment, behavior: reduced ? 'auto' : 'smooth'});
    }
  }

  function navigateApps(key, active) {
    if (appsScreen.hidden || !panel.hidden || !/^(ArrowUp|ArrowDown)$/.test(key)) return false;
    var down = key === 'ArrowDown';
    var tiles = appGrid.querySelectorAll('.tile');
    if (!moving && document.querySelector('header').contains(active) && down) {
      search.focus();
      return true;
    }
    if (active === search) {
      if (down && tiles.length) {
        var last = document.getElementById('app-' + lastAppId);
        focusAppTile(last && last.offsetWidth ? last : tiles[0]);
      } else if (!down) {
        appsTab.focus();
        window.scrollTo(0, 0);
      }
      return true;
    }
    var index = Array.prototype.indexOf.call(tiles, active);
    if (index < 0) return false;
    var columns = appsColumns;
    var row = Math.floor(index / columns) + (down ? 1 : -1);
    var column = !down && active === clippedTile ? clippedColumn : index % columns;
    clippedTile = null;
    clippedColumn = null;
    if (row < 0) {
      if (!moving) search.focus();
    } else if (row * columns < tiles.length) {
      var target = Math.min(row * columns + column, tiles.length - 1);
      if (target % columns !== column) {
        clippedColumn = column;
        clippedTile = tiles[target];
      }
      focusAppTile(tiles[target]);
    }
    return true;
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
    if (panelAnchor && panelAnchor.dataset.panel) panelAnchor.setAttribute('aria-expanded', 'false');
    panelParent = null;
    panelFocusByTitle = Object.create(null);
    if (restoreFocus && panelAnchor && panelAnchor.offsetWidth) panelAnchor.focus();
    positionGlass();
  }

  function openPanel(title, anchor, choices, parent) {
    if (!panel.hidden && panelItems.contains(document.activeElement)) {
      panelFocusByTitle[panelTitle.textContent] =
        Array.prototype.indexOf.call(panelItems.children, document.activeElement);
    }
    if (panelAnchor && panelAnchor.dataset.panel && panelAnchor !== anchor) {
      panelAnchor.setAttribute('aria-expanded', 'false');
    }
    panelAnchor = anchor;
    if (anchor.dataset.panel) anchor.setAttribute('aria-expanded', 'true');
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
    var previous = returningToParent && panelItems.children[panelFocusByTitle[title]];
    (previous || panel.querySelector('button') || panel).focus();
  }

  function systemAction(action) {
    return function () {
      if (native) native.settings(action);
      else window.showStatus('Available on a compatible Android TV');
    };
  }

  function toggleDock(id) {
    var index = pins.indexOf(id);
    var visiblePins = apps.filter(function (app) { return pins.indexOf(app.id) >= 0; }).length;
    if (index < 0 && visiblePins >= slots) {
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
    else {
      var homeTarget = document.getElementById('home-' + id) || document.getElementById('add-home-app');
      (homeTarget || homeTab).focus();
    }
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
      }]
    );
    openPanel(app.name, button, choices);
  }

  window.handleRemoteAppOk = function (held) {
    var active = document.activeElement;
    if (!active || !active.dataset.app || moving || !panel.hidden) return;
    if (held) appMenu(active);
    else active.click();
  };

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

  function applyWallpaper(id) {
    wallpaper = id;
    localStorage.setItem('wallpaper', id);
    document.body.dataset.wallpaper = id;
    if (!panel.hidden && panelTitle.textContent === 'Wallpaper') {
      wallpapers.forEach(function (item, index) {
        panelItems.children[index + 1].textContent =
          item[1] + (item[0] === id ? ' · Selected' : '');
      });
    }
  }

  function restartWallpaperRotation() {
    clearInterval(wallpaperTimer);
    if (!wallpaperRotation) return;
    wallpaperTimer = setInterval(function () {
      var index = wallpapers.findIndex(function (item) { return item[0] === wallpaper; });
      var next = index < 1 || index === wallpapers.length - 1 ? 1 : index + 1;
      applyWallpaper(wallpapers[next][0]);
    }, 60000);
  }

  function settingsMenu(anchor) {
    function back() { settingsMenu(anchor); }
    function section(title, options, parent) {
      return function () { openPanel(title, anchor, options, parent || back); };
    }
    function chooseWallpaper() {
      var options = wallpapers.map(function (item) {
        return [item[1] + (item[0] === wallpaper ? ' · Selected' : ''), function () {
          applyWallpaper(item[0]);
          restartWallpaperRotation();
        }];
      });
      options.unshift(['Auto-rotate every 60 seconds · ' + (wallpaperRotation ? 'On' : 'Off'), function () {
        wallpaperRotation = !wallpaperRotation;
        localStorage.setItem('wallpaperRotation', wallpaperRotation);
        this.textContent = 'Auto-rotate every 60 seconds · ' + (wallpaperRotation ? 'On' : 'Off');
        restartWallpaperRotation();
      }]);
      openPanel('Wallpaper', anchor, options, appearance);
    }
    function appearance() {
      openPanel('Appearance', anchor, [
        ['Wallpaper', chooseWallpaper],
        ['Clock and date', clockSettings]
      ], back);
    }
    function clockSettings() {
      openPanel('Clock and date', anchor, [
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
        ['Time format · ' + (use24Hour ? '24-hour' : '12-hour'), function () {
          use24Hour = !use24Hour;
          localStorage.setItem('clock24', use24Hour);
          this.textContent = 'Time format · ' + (use24Hour ? '24-hour' : '12-hour');
          clock();
        }]
      ], appearance);
    }
    function dockSlots() {
      var options = [4, 5, 6, 7].map(function (count) {
        return [count + ' slots' + (count === slots ? ' · Selected' : ''), function () {
          var visiblePins = apps.filter(function (app) { return pins.indexOf(app.id) >= 0; }).length;
          if (visiblePins > count) {
            window.showStatus('Remove apps before reducing Dock slots');
            return;
          }
          slots = count;
          localStorage.setItem('slots', slots);
          render();
          options.forEach(function (_, index) {
            panelItems.children[index].textContent =
              (index + 4) + ' slots' + (index + 4 === slots ? ' · Selected' : '');
          });
        }];
      });
      openPanel('Dock slots', anchor, options, layout);
    }
    function layout() {
      openPanel('Home and apps', anchor, [
        ['Dock slots', dockSlots],
        ['App organization', section('App organization', [
          ['Hold OK on an app to move it, add it to Home, or manage its Dock placement.']
        ], layout)]
      ], back);
    }
    function device() {
      openPanel('Device', anchor, [
        ['Home setup', section('Home setup', [
          ['Set CleanTVOS as Home', systemAction('activate')],
          ['Restore Factory Home', systemAction('restore')]
        ], device)],
        ['Connections', section('Connections', [
          ['TV input controls', systemAction('inputs')],
          ['Wi-Fi settings', systemAction('wifi')],
          ['Network settings', systemAction('network')],
          ['VPN settings', systemAction('vpn')]
        ], device)],
        ['Android settings', systemAction('system')]
      ], back);
    }
    openPanel('Settings', anchor, [
      ['Appearance', appearance],
      ['Home and apps', layout],
      ['Accessibility', section('Accessibility', [
        ['Reduce motion · ' + (reduced ? 'On' : 'Off'), function () {
          reduced = !reduced;
          localStorage.setItem('motion', reduced);
          document.body.classList.toggle('reduced', reduced);
          this.textContent = 'Reduce motion · ' + (reduced ? 'On' : 'Off');
        }]
      ])],
      ['Device', device],
      ['Info', info]
    ]);
    function info() {
      openPanel('Info', anchor, [
        ['CleanTVOS'],
        ['Version 1.0'],
        ['Sony RMF-TX310E navigation', section('Remote navigation', [
          ['Use the arrows to move, OK to select, hold OK on an app for options, and BACK to return.']
        ], info)]
      ], back);
    }
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
      openPanel(options[0], button, options[1]);
    };
  });

  window.closePanel = function () {
    if (!panel.hidden) {
      if (panelParent) {
        returningToParent = true;
        panelParent();
        returningToParent = false;
      }
      else hidePanel(true);
    } else if (!quickMenu.hidden) {
      setQuickOpen(false);
      quickToggle.focus();
    } else if (homeExpanded && appsScreen.hidden) {
      setHomeExpanded(false);
      if (dock.firstElementChild) dock.firstElementChild.focus();
      window.scrollTo(0, 0);
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
  function activateSearch() {
    if (!search.readOnly) return;
    search.blur();
    search.readOnly = false;
    search.focus();
    if (native) native.showSearchKeyboard();
  }
  search.onclick = activateSearch;
  search.onblur = function () { search.readOnly = true; };
  search.oninput = render;
  document.addEventListener('pointerup', cancelHold);
  document.addEventListener('pointercancel', cancelHold);
  window.addEventListener('blur', cancelHold);
  function okKey(event) { return event.key === 'Enter' || event.keyCode === 23; }

  document.addEventListener('keydown', function (event) {
    if (!okKey(event)) return;
    if (event.target === search && search.readOnly && event.type === 'keydown') {
      event.preventDefault();
      activateSearch();
      return;
    }
    if (event.repeat && (hold || suppressClick)) { event.preventDefault(); return; }
    if (!event.target.dataset.app || moving || !panel.hidden) return;
    event.preventDefault();
    beginHold(event.target);
  });

  document.addEventListener('keyup', function (event) {
    if (!okKey(event)) return;
    if (event.target === search && search.readOnly && event.type === 'keydown') {
      event.preventDefault();
      activateSearch();
      return;
    }
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
      if (!controls.length) { event.preventDefault(); return; }
      var index = Array.prototype.indexOf.call(controls, document.activeElement);
      controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
      event.preventDefault();
      return;
    }
    if ((event.key || '').indexOf('Arrow') !== 0 || (event.target === search && !search.readOnly && /Left|Right/.test(event.key))) return;
    if (/ArrowLeft|ArrowRight/.test(event.key)) { clippedTile = null; clippedColumn = null; }
    if (navigateHome(event.key, document.activeElement) || navigateApps(event.key, document.activeElement)) {
      event.preventDefault();
      return;
    }
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
    if (best && best.dataset.area === 'app') focusAppTile(best);
    else if (best) best.focus();
    else if (panel.hidden && active === appsTab && event.key === 'ArrowRight') quickToggle.focus();
    else if (panel.hidden && active === quickToggle && quickMenu.hidden && event.key === 'ArrowLeft') appsTab.focus();
    else if (active === document.body) scope.querySelector('button').focus();
  });

  function clock() {
    var now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:!use24Hour});
    document.getElementById('date').textContent = now.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
  }
  window.receiveApps = function (list) {
    apps = list;
    if (apps.length && (!dockLayoutUpdated || localStorage.getItem('pins') === null)) {
      pins = pins.filter(function (id) {
        return apps.some(function (app) { return app.id === id; });
      }).slice(0, slots);
      var preferred = [/^YouTube$/i, /^Netflix$/i, /^Prime Video$/i, /VPN/i];
      preferred.forEach(function (pattern) {
        var app = apps.find(function (entry) {
          return pattern.test(entry.name) && pins.indexOf(entry.id) < 0 &&
            shortcuts.indexOf(entry.id) < 0;
        });
        if (app && pins.length < slots) pins.push(app.id);
      });
      apps.forEach(function (app) {
        if (pins.length < slots && pins.indexOf(app.id) < 0 &&
            shortcuts.indexOf(app.id) < 0) pins.push(app.id);
      });
      localStorage.setItem('pins', JSON.stringify(pins));
      localStorage.setItem('sixSlotDock', 'true');
      localStorage.setItem('slots', slots);
      dockLayoutUpdated = true;
    }
    render();
  };
  window.refreshHome = function (force) {
    if (!native) return;
    native.loadApps(Boolean(force));
    var vpn = document.getElementById('vpn');
    var connected = native.vpnConnected();
    vpn.textContent = connected ? 'VPN connected' : 'VPN';
    vpn.classList.toggle('connected', connected);
  };

  document.body.classList.toggle('reduced', reduced);
  document.getElementById('clock').hidden = !showClock;
  document.getElementById('date').hidden = !showDate;
  document.body.dataset.wallpaper = wallpaper;
  clock();
  setInterval(clock, 15000);
  restartWallpaperRotation();
  if (native) {
    document.body.classList.toggle('tv-efficient', native.useEfficientGraphics());
    window.refreshHome(true);
  }
  else {
    apps = ['YouTube', 'Netflix', 'Prime Video', 'Jellyfin', 'VLC', 'Spotify', 'VPN Client', 'Kodi'].map(function (name, i) {
      return {id: String(i), name: name};
    });
    if (localStorage.getItem('pins') === null) pins = ['0', '1', '3', '6'];
    window.receiveApps(apps);
  }

  homeTab.focus();
}());
