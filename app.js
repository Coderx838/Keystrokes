// Keystrokes -- app logic i need a cat pls//
(function(){
    "use strict";

    var A = window.KSAudio;
    var $ = function (s) { return document.querySelector(s);};
    var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

    var mode = "type";
    var helpOpen = false;

    // hidden input so mobile keyboards open //
    var trap = document.createElement("input");
    trap.type = "text"; trap.autocapitalize = "off"; trap.autocomplete = "off";
    trap.spellcheck = false; trap.setAttribute("aria-hidden", "true");
    trap.tabIndex = -1;
    trap.style.cssText =
	    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;" +
	    "border:0;padding:0;outline:none;background:transparent;z-index:-1;";
    document.body.appendChild(trap);

    function focusTrap() {
        try { trap.focus({ preventScroll: true }); } catch (e) { try { trap.focus(); } catch (e2) {} }
        if (window.scrollY !== 0) window.scrollTo(0, 0);
    }

    $$(".tab").forEach(function (t) {
		t.addEventListener("click", function () {
			var m = t.dataset.mode;
			if (m === mode) return;
			$$(".tab").forEach(function (x) {
				var on = x.dataset.mode === m;
				x.classList.toggle("is-on", on);
				x.setAttribute("aria-selected", on ? "true" : "false");
			});
			$$(".mode").forEach(function (s) { s.classList.remove("is-on"); });
			$("#mode-" + m).classList.add("is-on");
			mode = m;
			A.init();
			if (m === "piano") openHelp(); else closeHelp();
			if (m === "type") setTimeout(focusTrap, 60); else trap.blur();
			window.scrollTo({ top: 0, behavior: "smooth" });
		});
	});

    // knobs //

    $$(".knob").forEach(function (k) {
		var min = +k.dataset.min, max = +k.dataset.max;
		var val = +k.dataset.val, unit = k.dataset.unit || "";
		var dial = k.querySelector(".dial"), bar = k.querySelector(".dial i");
		var valEl = k.querySelector(".knob-val");
		var name = k.dataset.knob;
		var dragging = false, startY = 0, startVal = 0;

		function paint() {
			var pct = (val - min) / (max - min);
			bar.style.transform = "translate(-50%,-100%) rotate(" + (-135 + pct * 270) + "deg)";
			valEl.textContent = Math.round(val) + unit;
			A.set(name, Math.round(val));
		}
		function setV(v) { val = Math.max(min, Math.min(max, v)); paint(); }

		k.addEventListener("pointerdown", function (e) {
			dragging = true; startY = e.clientY; startVal = val;
			k.classList.add("is-drag"); k.setPointerCapture(e.pointerId);
			A.init(); e.preventDefault();
		});
		k.addEventListener("pointermove", function (e) {
			if (!dragging) return;
			var d = (startY - e.clientY) * 0.7;
			setV(startVal + (d / 160) * (max - min));
		});
		["pointerup", "pointercancel"].forEach(function (ev) {
			k.addEventListener(ev, function () { dragging = false; k.classList.remove("is-drag"); });
		});
		k.addEventListener("wheel", function (e) {
			e.preventDefault();
			setV(val + (e.deltaY < 0 ? 1 : -1) * ((max - min) / 40));
		}, { passive: false });

		paint();
	});

    // viz bars //
    var viz = $("#viz"), bars = [];
	for (var i = 0; i < 24; i++) { var b = document.createElement("i"); viz.appendChild(b); bars.push(b); }
	(function tickViz() {
		var d = A.ready ? A.levels() : null;
		for (var i = 0; i < bars.length; i++) {
			var v = d ? d[i + 2] / 255 : 0;
			bars[i].style.height = (4 + v * 40) + "px";
		}
		requestAnimationFrame(tickViz);
	})();

    // mode A //
    var typed = $("#typeTyped"), ghost = $("#typeGhost");
	var sentence = "";
	var seq = [];              // {ch, midi|drum} for loop //
	var noteTimes = [];

	// --- key strip --- //
	var strip = $("#strip");
	var STRIP = "abcdefghijklmnopqrstuvwxyz".split("");
	var stripKeys = {};
	STRIP.forEach(function (c) {
		var el = document.createElement("div");
		el.className = "key";
		el.innerHTML = c.toUpperCase() + "<small>" + (A.letterNote(c.charCodeAt(0) - 97) % 12 || "C") + "</small>";
		strip.appendChild(el);
		stripKeys[c] = el;
	});
	["SPACE", "ENTER"].forEach(function (lab) {
		var el = document.createElement("div");
		el.className = "key";
		el.style.minWidth = "74px";
		el.innerHTML = lab + "<small>" + (lab === "SPACE" ? "kick" : "snare") + "</small>";
		strip.appendChild(el);
		stripKeys[lab === "SPACE" ? " " : "enter"] = el;
	});
	for (var d = 1; d <= 8; d++) {
		(function (n) {
			var el = document.createElement("div");
			el.className = "key";
			el.innerHTML = n + "<small>drum</small>";
			strip.appendChild(el);
			stripKeys["" + n] = el;
		})(d);
	}
	function flashKey(k) {
		var el = stripKeys[k]; if (!el) return;
		el.classList.add("is-hit");
		setTimeout(function () { el.classList.remove("is-hit"); }, 130);
	}

    var cv = $("#letters"), cx = cv.getContext("2d");
	var letters = [], DPR = Math.min(window.devicePixelRatio || 1, 2);
	var serifReady = false;

	(function loadSerif() {
		if (!window.FontFace) { serifReady = true; return; }
		var f = new FontFace("Young Serif", 'url("assets/fonts/young-serif.woff2")');
		f.load().then(function (ff) { document.fonts.add(ff); serifReady = true; })["catch"](function () { serifReady = true; });
	})();

	function sizeCanvas() {
		var r = cv.getBoundingClientRect();
		cv.width = Math.max(1, Math.round(r.width * DPR));
		cv.height = Math.max(1, Math.round(r.height * DPR));
		cx.setTransform(DPR, 0, 0, DPR, 0, 0);
	}
	window.addEventListener("resize", sizeCanvas);

	var comboStreak = 0, lastNote = 0;

	function spawnLetter(ch, drum) {
		var r = cv.getBoundingClientRect();
		var W = r.width, H = r.height;
		var t = performance.now();
		letters.push({
			ch: ch === " " ? "·" : (ch === "\n" ? "↵" : ch.toUpperCase()),
			x: W * 0.5 + (Math.random() - 0.5) * Math.min(W * 0.6, 340),
			y: H - 46,
			vy: -(58 + Math.random() * 34),
			drift: (Math.random() - 0.5) * 22,
			rot: (Math.random() - 0.5) * 0.28,
			rotv: (Math.random() - 0.5) * 0.5,
			born: t, life: drum ? 1500 : 2300,
			size: 30 + Math.random() * 24,
			drum: !!drum, flash: t, wob: Math.random() * 6.28
		});
		if (letters.length > 60) letters.shift();

		// combo //
		var now = t;
		noteTimes = noteTimes.filter(function (x) { return now - x < 1500; });
		noteTimes.push(now);
		if (noteTimes.length >= 4 && now - lastNote > 0) {
			showCombo(noteTimes.length);
			noteTimes = [];
		}
		lastNote = now;
	}

	function showCombo(n) {
		var el = document.createElement("div");
		el.className = "combo";
		el.textContent = "COMBO ×" + n;
		document.body.appendChild(el);
		setTimeout(function () { el.remove(); }, 1000);
	}

	var beatLine = -1; // loop beat position 0..1 //

	function drawLetters(t) {
		var r = cv.getBoundingClientRect();
		var W = r.width, H = r.height;
		cx.clearRect(0, 0, W, H);

		// travelling beat line while looping //
		if (loopOn) {
			var speed = (A.get("tempo") / 60) * 130;   // px per sec //
			beatLine = ((t / 1000) * speed) % (H + 120);
			var y = H - beatLine;
			cx.save();
			var g = cx.createLinearGradient(0, y, W, y);
			g.addColorStop(0, "rgba(213,116,209,0)");
			g.addColorStop(0.5, "rgba(238,100,98,.9)");
			g.addColorStop(1, "rgba(213,116,209,0)");
			cx.strokeStyle = g; cx.lineWidth = 3;
			cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
			cx.restore();
			window._beatY = y;
		} else window._beatY = null;

		for (var i = letters.length - 1; i >= 0; i--) {
			var L = letters[i];
			var age = t - L.born;
			if (age > L.life) { letters.splice(i, 1); continue; }

			var p = age / L.life;
			L.y += L.vy / 60;
			L.x += L.drift / 60 + Math.sin(t / 420 + L.wob) * 0.42;
			L.rot += L.rotv / 260;

			// karaoke: light up when the beat line crosses //
			if (window._beatY != null && !L.lit && Math.abs(L.y - window._beatY) < 16) {
				L.lit = true; L.flash = t;
			}
			if (!loopOn) L.lit = false;

			var op = p > 0.74 ? 1 - (p - 0.74) / 0.26 : 1;
			var sc = age < 260 ? backOut(age / 260) : 1;
			sc *= (p > 0.6 ? 1 - (p - 0.6) * 0.4 : 1);

			var flashAge = t - L.flash;
			cx.save();
			cx.translate(L.x, L.y);
			cx.rotate(L.rot);
			cx.scale(sc, sc);
			cx.globalAlpha = Math.max(0, op);

			if (flashAge < 340) {
				var fp = flashAge / 340;
				cx.beginPath();
				cx.arc(0, 0, 14 + fp * 46, 0, 6.2832);
				cx.strokeStyle = "rgba(255,255,255," + (1 - fp) + ")";
				cx.lineWidth = 3.5 - fp * 2.5;
				cx.stroke();
			}

			cx.font = (L.drum ? "400 " : "400 ") + L.size + 'px "Young Serif", georgia, serif';
			cx.textAlign = "center"; cx.textBaseline = "middle";
			cx.lineJoin = "round";
			cx.strokeStyle = "#190439"; cx.lineWidth = 7;
			cx.strokeText(L.ch, 0, 0);
			cx.fillStyle = L.drum ? "#ee6462" : (L.lit ? "#fff6e0" : "#ecdec3");
			cx.fillText(L.ch, 0, 0);
			if (L.lit) {
				cx.strokeStyle = "#d574d1"; cx.lineWidth = 2;
				cx.strokeText(L.ch, 0, 0);
			}
			cx.restore();
		}
		requestAnimationFrame(drawLetters);
	}

    function backOut(x) {
		var c1 = 1.9, c3 = c1 + 1;
		return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
	}
    requestAnimationFrame(drawLetters);

    // input handling //
    function typeChar(ch) {
		A.init();
		if (ch === "Backspace") {
			sentence = sentence.slice(0, -1);
			seq.pop(); paintLine(); return;
		}
		if (ch.length !== 1) return;
		if (sentence.length > 90) { sentence = ""; seq = []; }

		var res = A.charTrigger(ch);
		sentence += ch;
		paintLine();
		flashKey(ch === "\n" ? "enter" : ch);
		if (res) spawnLetter(ch, res.drum);
		seq.push({ ch: ch, drum: res ? res.drum : false });
	}

	function paintLine() {
		typed.textContent = sentence;
		ghost.style.display = sentence ? "none" : "";
	}

	window.addEventListener("keydown", function (e) {
		if (helpOpen && mode === "piano") return;
		if (mode !== "type") return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === "Backspace") { e.preventDefault(); typeChar("Backspace"); return; }
		if (e.key === "Enter") { e.preventDefault(); typeChar("\n"); return; }
		if (e.key === " ") { e.preventDefault(); typeChar(" "); return; }
		if (e.key.length === 1) { e.preventDefault(); typeChar(e.key); }
	});
	trap.addEventListener("keydown", function (e) { e.preventDefault(); });
	$("#mode-type").addEventListener("click", function (e) {
		if (e.target.closest("button") || e.target.closest(".knob")) return;
		try { trap.focus(); } catch (er) {}
	});

	// --- loop playback --- //
	var loopOn = false, loopTimer = null, loopIdx = 0;
	var btnLoop = $("#btnLoop");

	function stepMs() { return 60000 / A.get("tempo") / 2; }   // 8th notes //

	function loopTick() {
		if (!seq.length) { stopLoop(); return; }
		var step = stepMs();
		var guard = 0;
		// schedule the whole pattern each bar-ish so it stays tight //
		loopIdx = 0;
		var t0 = performance.now();
		(function run() {
			if (!loopOn) return;
			var item = seq[loopIdx % seq.length];
			var res = A.charTrigger(item.ch, { at: 0 });
			if (res) spawnLetter(item.ch, res.drum);
			// auto bass on beats 1 & 3 of each bar //
			if (loopIdx % 8 === 0 && !item.drum) {
				var m = A.letterNote(item.ch.toLowerCase().charCodeAt(0) - 97);
				A.pluck(m - 24, { gain: 0.16, dur: 1.4 });
			}
			loopIdx++;
			if (++guard > 4000) return;
			loopTimer = setTimeout(run, step);
		})();
	}

	function startLoop() {
		if (!seq.length) { showCombo(1); return; }
		A.init(); loopOn = true; loopIdx = 0;
		btnLoop.classList.add("is-on");
		$("#liveSticker").textContent = "LOOPING";
		loopTick();
	}
	function stopLoop() {
		loopOn = false; clearTimeout(loopTimer);
		btnLoop.classList.remove("is-on");
		$("#liveSticker").textContent = "LIVE";
	}
	btnLoop.addEventListener("click", function () { loopOn ? stopLoop() : startLoop(); });

	// --- clear --- //
	$("#btnClear").addEventListener("click", function () {
		sentence = ""; seq = []; letters = []; noteTimes = [];
		paintLine(); stopLoop();
	});

	// --- record --- //
	var btnRec = $("#btnRec"), recording = false;
	btnRec.addEventListener("click", function () {
		A.init();
		if (!recording) {
			A.recStart(); recording = true;
			btnRec.classList.add("is-on");
			btnRec.querySelector(".lbl").textContent = "STOP";
		} else {
			var blob = A.recStop(); recording = false;
			btnRec.classList.remove("is-on");
			btnRec.querySelector(".lbl").textContent = "RECORD";
			if (blob) {
				var url = URL.createObjectURL(blob);
				var a = document.createElement("a");
				a.href = url; a.download = "keystrokes-beat.wav";
				document.body.appendChild(a); a.click(); a.remove();
				setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
			}
		}
	});

    // mode B - Piano //
    var OCT = 4;                          // base octave //
	var sustain = false;
	var held = Object.create(null);       // keyId -> true //

	var WHITES = [
		{ s: 0, k: "a" }, { s: 2, k: "s" }, { s: 4, k: "d" }, { s: 5, k: "f" },
		{ s: 7, k: "g" }, { s: 9, k: "h" }, { s: 11, k: "j" }, { s: 12, k: "k" },
		{ s: 14, k: "l" }, { s: 16, k: ";" }, { s: 17, k: "'" }
	];
	var BLACK_AFTER = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5, 13: 7, 15: 8 };
	var BLACKS = [
		{ s: 1, k: "w" }, { s: 3, k: "e" }, { s: 6, k: "t" }, { s: 8, k: "y" },
		{ s: 10, k: "u" }, { s: 13, k: "o" }, { s: 15, k: "p" }
	];
	var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	var DRUMS = [
		{ n: "KICK", id: "kick" }, { n: "SNARE", id: "snare" },
		{ n: "HI-HAT", id: "hat" }, { n: "OPEN HH", id: "ohat" },
		{ n: "TOM 1", id: "tom1" }, { n: "TOM 2", id: "tom2" },
		{ n: "TOM 3", id: "tom3" }, { n: "CRASH", id: "crash" }
	];
	var NOTE_GLYPH = ["♪", "♫", "♬", "♩", "✦", "✧", "♪"];

	function baseMidi() { return 12 * (OCT + 1); }
	function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

	var whitesEl = $("#whites"), blacksEl = $("#blacks"), fxLayer = $("#fxLayer");
	var keyByChar = {};

	function buildPiano() {
		whitesEl.innerHTML = ""; blacksEl.innerHTML = ""; keyByChar = {};
		var N = WHITES.length, w = 100 / N;

		WHITES.forEach(function (K, idx) {
			var midi = baseMidi() + K.s;
			var el = document.createElement("div");
			el.className = "wkey"; el.dataset.id = "w" + K.s;
			el.innerHTML = '<span class="kk">' + K.k.toUpperCase() + "</span>" +
										 '<span class="nn">' + noteName(midi) + "</span>";
			whitesEl.appendChild(el);
			keyByChar[K.k] = { el: el, midi: midi, black: false };
			bindKey(el, "w" + K.s, midi, false);
		});

		BLACKS.forEach(function (K) {
			var midi = baseMidi() + K.s;
			var after = BLACK_AFTER[K.s];
			var el = document.createElement("div");
			el.className = "bkey"; el.dataset.id = "b" + K.s;
			el.style.left = ((after + 1) * w - 3.2) + "%";
			el.innerHTML = '<span class="kk">' + K.k.toUpperCase() + "</span>" +
										 '<span class="nn">' + noteName(midi) + "</span>";
			blacksEl.appendChild(el);
			keyByChar[K.k] = { el: el, midi: midi, black: true };
			bindKey(el, "b" + K.s, midi, true);
		});

		$("#octLabel").textContent = "OCTAVE " + OCT;
	}

	function pianoRectOf(el) {
		var p = $(".stage-piano").getBoundingClientRect();
		var r = el.getBoundingClientRect();
		return { x: r.left - p.left + r.width / 2, y: r.top - p.top + r.height * 0.42, w: r.width, h: r.height };
	}

	function burst(el) {
		var r = pianoRectOf(el);
		var rip = document.createElement("div");
		rip.className = "rip";
		rip.style.cssText = "left:" + r.x + "px;top:" + r.y + "px;width:" + (r.w * 1.5) +
			"px;height:" + (r.w * 1.5) + "px;";
		fxLayer.appendChild(rip);
		setTimeout(function () { rip.remove(); }, 440);

		var n = document.createElement("div");
		n.className = "note-pop";
		n.textContent = NOTE_GLYPH[Math.floor(Math.random() * NOTE_GLYPH.length)];
		n.style.cssText = "left:" + r.x + "px;top:" + (r.y - 8) + "px;";
		fxLayer.appendChild(n);
		setTimeout(function () { n.remove(); }, 800);
	}

	function down(id, el, midi) {
		if (held[id]) return;
		held[id] = true;
		A.init();
		el.classList.add("down");
		if (sustain) {
			var sh = document.createElement("div");
			sh.className = "shimmer"; sh.dataset.sh = id;
			el.appendChild(sh);
		}
		A.piano(midi, { id: id, gain: 0.3 });
		burst(el);
		flashKey(midi);
	}

	function up(id, el) {
		if (!held[id]) return;
		held[id] = false;
		el.classList.remove("down");
		var sh = el.querySelector(".shimmer"); if (sh) sh.remove();
		if (!sustain) A.pianoOff(id);
	}

	function bindKey(el, id, midi) {
		el.addEventListener("pointerdown", function (e) {
			e.preventDefault();
			try { el.setPointerCapture(e.pointerId); } catch (er) {}
			down(id, el, midi);
		});
		["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
			el.addEventListener(ev, function () { up(id, el); });
		});
	}

	function flashKeyPad() {}

	// drums pads //
	var drumsEl = $("#drums");
	DRUMS.forEach(function (D, i) {
		var b = document.createElement("button");
		b.className = "pad"; b.dataset.id = D.id; b.dataset.n = i + 1;
		b.innerHTML = '<span class="num">' + (i + 1) + "</span>" + D.n;
		drumsEl.appendChild(b);
		var firing = false;
		b.addEventListener("pointerdown", function (e) {
			e.preventDefault(); firing = true;
			b.classList.add("down"); A.init(); A.drumByName(D.id);
			var r = b.getBoundingClientRect(), p = $(".stage-piano").getBoundingClientRect();
			var n = document.createElement("div");
			n.className = "note-pop";
			n.textContent = NOTE_GLYPH[i % NOTE_GLYPH.length];
			n.style.cssText = "left:" + (r.left - p.left + r.width / 2) + "px;top:" + (r.top - p.top) + "px;";
			fxLayer.appendChild(n); setTimeout(function () { n.remove(); }, 800);
		});
		["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
			b.addEventListener(ev, function () { firing = false; b.classList.remove("down"); });
		});
		D.el = b;
	});

	// piano-mode computer keyboard //
	window.addEventListener("keydown", function (e) {
		if (mode !== "piano" || helpOpen) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		var k = e.key.toLowerCase();

		if (k === "z") { e.preventDefault(); setOct(OCT - 1); return; }
		if (k === "x") { e.preventDefault(); setOct(OCT + 1); return; }
		if (k === "?" || k === "/") { e.preventDefault(); openHelp(); return; }
		if (k === " ") {
			e.preventDefault();
			if (!sustain) { sustain = true; $("#btnSus").classList.add("is-on"); }
			return;
		}
		if (k >= "1" && k <= "8") {
			if (e.repeat) return;
			e.preventDefault();
			var D = DRUMS[+k - 1];
			D.el.classList.add("down");
			setTimeout(function () { D.el.classList.remove("down"); }, 130);
			A.init(); A.drumByName(D.id);
			return;
		}
		var K = keyByChar[k];
		if (K) {
			e.preventDefault();
			if (e.repeat) return;
			down("k" + k, K.el, K.midi);
		}
	});

	window.addEventListener("keyup", function (e) {
		if (mode !== "piano") return;
		var k = e.key.toLowerCase();
		if (k === " ") {
			sustain = false; $("#btnSus").classList.remove("is-on");
			Object.keys(held).forEach(function (id) {
				if (id.indexOf("k") === 0) {
					var kk = id.slice(1), K = keyByChar[kk];
					if (K) { K.el.classList.remove("down"); var s = K.el.querySelector(".shimmer"); if (s) s.remove(); A.pianoOff(id); held[id] = false; }
				}
			});
			return;
		}
		var K = keyByChar[k];
		if (K) up("k" + k, K.el);
	});

	function setOct(n) {
		n = Math.max(2, Math.min(6, n));
		if (n === OCT) return;
		OCT = n;
		Object.keys(held).forEach(function (id) { A.pianoOff(id); delete held[id]; });
		$$(".wkey,.bkey").forEach(function (e) {
			e.classList.remove("down");
			var s = e.querySelector(".shimmer"); if (s) s.remove();
		});
		buildPiano();
	}
	$("#btnOctD").addEventListener("click", function () { setOct(OCT - 1); });
	$("#btnOctU").addEventListener("click", function () { setOct(OCT + 1); });
	$("#btnSus").addEventListener("click", function () {
		sustain = !sustain;
		$("#btnSus").classList.toggle("is-on", sustain);
		if (!sustain) Object.keys(held).forEach(function (id) { if (id[0] === "k") A.pianoOff(id); });
	});

	// HOW TO PLAY//

	var howto = $("#howto");
	function openHelp() {
		if (mode !== "piano") return; // overlay lives inside #mode-piano; never flag help in type mode //
		helpOpen = true;
		howto.style.display = "";
		howto.classList.remove("hide");
		Object.keys(held).forEach(function (id) { A.pianoOff(id); delete held[id]; });
		$$(".wkey,.bkey").forEach(function (e) { e.classList.remove("down"); });
	}
	function closeHelp() {
		helpOpen = false;
		howto.classList.add("hide");
		setTimeout(function () { if (!helpOpen) howto.style.display = "none"; }, 320);
		A.init();
		setTimeout(function () { try { trap.focus(); } catch (e) {} }, 80);
	}
	$("#btnStart").addEventListener("click", closeHelp);
	$("#btnHelp").addEventListener("click", openHelp);
	howto.addEventListener("click", function (e) { if (e.target === howto) closeHelp(); });
	window.addEventListener("keydown", function (e) {
		if (!helpOpen) return;
		if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); closeHelp(); }
	});

	//  BOOT//		 
	buildPiano();
	paintLine();
	sizeCanvas();
	// NOTE: do NOT openHelp() here — .howto lives inside #mode-piano (display:none  in type mode)//
		// so flagging helpOpen at boot invisibly blocked all typing. //

	// music starts only after a real gesture //
	["pointerdown", "keydown"].forEach(function (ev) {
		window.addEventListener(ev, function once() {
			A.init();
			window.removeEventListener(ev, once);
		}, { once: true });
	});
})();

// --- Finally end --- //

