//  Keystrokes - audio engine //
// everything is synthesised live. no samples, no mp3. //
(function(global){
    "use strict";

    var ctx = null
    var master, comp, analyser, eqLo, echoSend, delay, fb, wet;
    var wobbleLFO, wobbleGain;
    var recTap = null, recChunks = [], recording = false;
    var params = {tempo:110, echo:35, wobble:20, tone:70, echoP:30, vol:80 };
    var active = Object.create(null);

    // setup //
    function ensure() {
        if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
        var AC = global.AudioContext || global.webkitAudioContext;
        ctx = new AC();

        master = ctx.createGain(); master.gain.value = 0.8;
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 5;
        comp.attack.value = 0.004; comp.release.value = 0.22;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.72;

        eqLo = ctx.createBiquadFilter();
        eqLo.type = "lowpass"; eqLo.frequency.value = 16000; eqLo.Q.value = 0.4;

        master.connect(eqLo); eqLo.connect(comp);
        comp.connect(analyser); analyser.connect(ctx.destination);

        // echo bus //
        delay = ctx.createDelay(1.2); delay.delayTime.value = 0.28;
        fb = ctx.createGain(); fb.gain.value = 0.34;
        wet = ctx.createGain(); wet.gain.value = params.echo / 100 * 0.85;
        echoSend = ctx.createGain(); echoSend.gain.value = 1;
        echoSend.connect(delay); delay.connect(fb); fb.connect(delay);
        delay.connect(wet); wet.connect(master);

    // wobble (shared vibrato/tremolo source)   //
        wobbleLFO = ctx.createOscillator(); wobbleLFO.frequency.value = 5.4;
        wobbleGain = ctx.createGain(); wobbleGain.gain.value = 0;
        wobbleLFO.connect(wobbleGain); wobbleLFO.start();

        setupRecTap();
        return ctx;
    }

    function now(){return ctx.currentTime;}

    // --- helpers --- //
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    function send(node, amt){
        if (amt == null) amt = params.echo / 100;
        if (amt <= 0.001) return;
        var g = ctx.createGain(); g.gain.value = amt * 0.9;
        node.connect(g); g.connect(echoSend);

    }

    // C major pentatonix across letters //
    var PENTA = [0,2,4,7,9];
    function letterNote(i){
        var oct = Math.floor(i/PENTA.length);
        var deg = i % PENTA.length;
        return 60 + PENTA[deg] + oct *12;
    }
    
    // voices //
    function env(g, t, a, d, peak, s, r, sus) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(Math.max(peak * s, 0.0001), t + a + d);
        if (sus) g.gain.setValueAtTime(Math.max(peak * s, 0.0001), t + a + d);
        else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
    }

    // plucky synth note(type beats) //
    function pluck(midi, opts) {
        ensure();
        opts = opts || {};
        var t = now() + (opts.at || 0);
        var f = mtof(midi);
        var dur = opts.dur || 0.9;

        var g = ctx.createGain();
        var lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(Math.min(f * 7, 12000), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 320), t + dur * 0.75);
        lp.Q.value = 6;

    // wobble on filter cutoff //
        if (params.wobble > 1) {
            var wg = ctx.createGain();
            wg.gain.value = (params.wobble / 100) * f * 0.28;
            wobbleGain.connect(wg); wg.connect(lp.frequency);
            g._wg = wg;
        }

        var o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = f;
        var o2 = ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = f;
        o2.detune.value = 7;
        var o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = f * 2;
        var g3 = ctx.createGain(); g3.gain.value = 0.32;

        o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp);
        lp.connect(g); g.connect(master); send(g);

        env(g, t, 0.006, dur * 0.9, opts.gain || 0.3, 0.0008, 0.18, false);

        o1.start(t); o2.start(t); o3.start(t);
        var end = t + dur + 0.3;
        o1.stop(end); o2.stop(end); o3.stop(end);
        o1.onended = function () { if (g._wg) { try { wobbleGain.disconnect(g._wg); } catch (e) {} } };
    }
    function kick(opts) {
        ensure(); opts = opts || {};
        var t = now() + (opts.at || 0);
        var o = ctx.createOscillator(); o.type = "sine";
        var g = ctx.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.85, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.4);
        click(t, 0.7);
    }
    
    function click(t, amt) {
		var b = ctx.createBuffer(1, 900, ctx.sampleRate);
		var d = b.getChannelData(0);
		for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
		var s = ctx.createBufferSource(); s.buffer = b;
		var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
		var g = ctx.createGain(); g.gain.value = 0.22 * amt;
		s.connect(hp); hp.connect(g); g.connect(master);
		s.start(t);
	}

    function noiseBuf(dur) {
		var n = Math.floor(ctx.sampleRate * dur);
		var b = ctx.createBuffer(1, n, ctx.sampleRate);
		var d = b.getChannelData(0);
		for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
		return b;
	}

    function snare(opts) {
		ensure(); opts = opts || {};
		var t = now() + (opts.at || 0);
		var s = ctx.createBufferSource(); s.buffer = noiseBuf(0.3);
		var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.9;
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.55, t + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
		s.connect(bp); bp.connect(g); g.connect(master); send(g, params.echo / 100 * 0.5);
		s.start(t); s.stop(t + 0.3);

		var o = ctx.createOscillator(); o.type = "triangle";
		o.frequency.setValueAtTime(230, t);
		o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
		var og = ctx.createGain();
		og.gain.setValueAtTime(0.0001, t);
		og.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
		og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
		o.connect(og); og.connect(master);
		o.start(t); o.stop(t + 0.2);
	}

	function hat(open, opts) {
		ensure(); opts = opts || {};
		var t = now() + (opts.at || 0);
		var dur = open ? 0.34 : 0.06;
		var s = ctx.createBufferSource(); s.buffer = noiseBuf(dur + 0.05);
		var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7200;
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.28, t + 0.003);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		s.connect(hp); hp.connect(g); g.connect(master);
		if (open) send(g, params.echo / 100 * 0.4);
		s.start(t); s.stop(t + dur + 0.05);
	}

	function tom(midi, opts) {
		ensure(); opts = opts || {};
		var t = now() + (opts.at || 0);
		var f = mtof(midi);
		var o = ctx.createOscillator(); o.type = "sine";
		o.frequency.setValueAtTime(f * 1.7, t);
		o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
		o.connect(g); g.connect(master); send(g, params.echo / 100 * 0.45);
		o.start(t); o.stop(t + 0.35);
	}

	function crash(opts) {
		ensure(); opts = opts || {};
		var t = now() + (opts.at || 0);
		var s = ctx.createBufferSource(); s.buffer = noiseBuf(1.4);
		var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200;
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.34, t + 0.008);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
		s.connect(hp); hp.connect(g); g.connect(master); send(g, 0.3);
		s.start(t); s.stop(t + 1.4);
	}

	function scratch(opts) {
		ensure(); opts = opts || {};
		var t = now() + (opts.at || 0);
		var s = ctx.createBufferSource(); s.buffer = noiseBuf(0.22);
		var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 7;
		bp.frequency.setValueAtTime(400, t);
		bp.frequency.exponentialRampToValueAtTime(3200, t + 0.09);
		bp.frequency.exponentialRampToValueAtTime(500, t + 0.21);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
		s.connect(bp); bp.connect(g); g.connect(master); send(g, 0.25);
		s.start(t); s.stop(t + 0.25);
	}

    // reale piano (that's what i think..) //
    var PARTIALS = [
		{ r: 1.000, g: 1.00, t: "sine" },
		{ r: 2.001, g: 0.44, t: "sine" },
		{ r: 3.004, g: 0.22, t: "sine" },
		{ r: 4.010, g: 0.13, t: "sine" },
		{ r: 5.022, g: 0.07, t: "sine" },
		{ r: 6.040, g: 0.04, t: "sine" }
	];

    function pianoNote(midi, opts) {
		ensure();
		opts = opts || {};
		var t = now() + (opts.at || 0);
		var f = mtof(midi);
		var id = opts.id != null ? opts.id : midi;
		if (active[id]) release(id, 0.06);

		var tone = params.tone / 100;              // 0 dark .. 1 bright //
		var amp = (opts.gain || 0.3);
		var bright = 0.35 + tone * 0.65;

		var vca = ctx.createGain();
		var lp = ctx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.setValueAtTime(Math.min(f * (3 + bright * 12), 15000), t);
		lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 420), t + 2.4);
		lp.Q.value = 0.6;

		vca.connect(lp); lp.connect(master); send(vca, params.echoP / 100 * 0.7);

		// tremolo from shared wobble source //
		if (params.wobble > 1) {
			var trem = ctx.createGain(); trem.gain.value = 1;
			var amt = ctx.createGain(); amt.gain.value = (params.wobble / 100) * 0.4;
			wobbleGain.connect(amt); amt.connect(trem.gain);
			vca.disconnect(); vca.connect(trem); trem.connect(lp);
			vca._trem = amt;
		}

		var oscs = [], i, p, o, og;
		for (i = 0; i < PARTIALS.length; i++) {
			p = PARTIALS[i];
			if (f * p.r > 17000) break;
			o = ctx.createOscillator();
			o.type = p.t; o.frequency.value = f * p.r;
			o.detune.value = (i % 2 ? 2.5 : -2.5) * (1 + i * 0.35);
			og = ctx.createGain();
			og.gain.value = p.g * (i === 0 ? 1 : bright);
			o.connect(og); og.connect(vca);
			o.start(t); oscs.push(o);
		}

		// hammer / key noise transient //
		var hb = ctx.createBufferSource(); hb.buffer = noiseBuf(0.05);
		var hbp = ctx.createBiquadFilter(); hbp.type = "bandpass";
		hbp.frequency.value = Math.min(f * 4, 6000); hbp.Q.value = 1.2;
		var hg = ctx.createGain();
		hg.gain.setValueAtTime(0.0001, t);
		hg.gain.exponentialRampToValueAtTime(amp * 0.5 * bright, t + 0.004);
		hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
		hbp.connect(hg); hg.connect(vca);
		hb.start(t); hb.stop(t + 0.07);

		// envelope: fast attack, long natural decay //
		var peak = amp * (1 - Math.max(0, (midi - 78)) / 40) * (midi < 48 ? 1.25 : 1);
		vca.gain.setValueAtTime(0.0001, t);
		vca.gain.exponentialRampToValueAtTime(Math.max(peak, 0.02), t + 0.006);
		vca.gain.exponentialRampToValueAtTime(Math.max(peak * 0.28, 0.006), t + 0.55);
		vca.gain.exponentialRampToValueAtTime(0.0001, t + 6.5);

		var voice = { gain: vca, oscs: oscs, end: t + 7, trem: vca._trem };
		active[id] = voice;
		oscs[0].onended = function () { if (active[id] === voice) delete active[id]; };
		oscs[0].stop(t + 7);
		return voice;
	}

    function release(id, at) {
		var v = active[id]; if (!v) return;
		var t = now() + (at || 0);
		try {
			v.gain.gain.cancelScheduledValues(t);
			v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
			v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
			for (var i = 0; i < v.oscs.length; i++) v.oscs[i].stop(t + 0.32);
			if (v.trem) { try { wobbleGain.disconnect(v.trem); } catch (e) {} }
		} catch (e) {}
		delete active[id];
	}

    // --------------- type-mode char trigger --------- //
    var DRUM_KEYS = { " ": "kick", "\n": "snare", "\r": "snare", "\t": "hat", "\\": "scratch" };
	function charTrigger(ch, opts) {
		ensure();
		opts = opts || {};
		if (DRUM_KEYS[ch]) {
			var k = DRUM_KEYS[ch];
			if (k === "kick") kick(opts);
			else if (k === "snare") snare(opts);
			else if (k === "hat") hat(false, opts);
			else scratch(opts);
			return { drum: true, kind: k };
		}
		if (ch >= "1" && ch <= "8") {
			var n = ["kick", "snare", "hat", "hat", "tom", "tom", "tom", "crash"][+ch - 1];
			if (n === "kick") kick(opts);
			else if (n === "snare") snare(opts);
			else if (n === "hat") hat(+ch % 2 === 0, opts);
			else if (n === "crash") crash(opts);
			else tom([50, 47, 43, 40][["tom", "tom", "tom"].indexOf(n)] || 45, opts);
			return { drum: true, kind: n };
		}
		if (!/[a-z]/i.test(ch)) return null;
		var idx = ch.toLowerCase().charCodeAt(0) - 97;
		var m = letterNote(idx);
		pluck(m, opts);
		return { drum: false, midi: m };
	}

    function drumByName(name, opts) {
		ensure();
		if (name === "kick") kick(opts);
		else if (name === "snare") snare(opts);
		else if (name === "hat") hat(false, opts);
		else if (name === "ohat") hat(true, opts);
		else if (name === "crash") crash(opts);
		else if (name === "tom1") tom(50, opts);
		else if (name === "tom2") tom(45, opts);
		else if (name === "tom3") tom(40, opts);
		else if (name === "scratch") scratch(opts);
	}
    // ---- params ---- //
    function set(name, val) {
		params[name] = val;
		ensure();
		if (name === "echo") wet.gain.setTargetAtTime(val / 100 * 0.85, now(), 0.03);
		if (name === "echoP") wet.gain.setTargetAtTime(val / 100 * 0.85, now(), 0.03);
		if (name === "vol") master.gain.setTargetAtTime(val / 100 * 0.95, now(), 0.03);
		if (name === "wobble") wobbleLFO.frequency.setTargetAtTime(4 + val / 100 * 5, now(), 0.05);
	}
	function get(name) { return params[name]; }

    // -------- analyser data --- ///
    var freqData = null;
	function levels() {
		if (!analyser) return null;
		if (!freqData) freqData = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(freqData);
		return freqData;
	}
    // ------------ WAV recorder ------------ ///
    function setupRecTap() {
		var proc = ctx.createScriptProcessor(4096, 2, 2);
		recTap = proc;
		var silent = ctx.createGain(); silent.gain.value = 0;
		analyser.connect(proc); proc.connect(silent); silent.connect(ctx.destination);
		proc.onaudioprocess = function (e) {
			if (!recording) return;
			var l = e.inputBuffer.getChannelData(0);
			var r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
			recChunks.push(new Float32Array(l), new Float32Array(r));
			recLen += l.length;
		};
	}
	var recLen = 0;

	function recStart() {
		ensure(); recChunks = []; recLen = 0; recording = true;
	}
	function recStop() {
		recording = false;
		if (!recLen) return null;
		var ch = 2, len = recLen;
		var buf = ctx.createBuffer(ch, len, ctx.sampleRate);
		var L = buf.getChannelData(0), R = buf.getChannelData(1);
		for (var c = 0; c < recChunks.length; c += 2) {
			L.set(recChunks[c], (c / 2) * recChunks[c].length);
			R.set(recChunks[c + 1], (c / 2) * recChunks[c + 1].length);
		}
		recChunks = []; recLen = 0;
		return encodeWAV(buf);
	}

	function encodeWAV(buffer) {
		var nCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
		var bytes = 44 + len * nCh * 2;
		var ab = new ArrayBuffer(bytes), dv = new DataView(ab);
		function w(s, o) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
		w("RIFF", 0); dv.setUint32(4, bytes - 8, true); w("WAVE", 8);
		w("fmt ", 12); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
		dv.setUint16(22, nCh, true); dv.setUint32(24, sr, true);
		dv.setUint32(28, sr * nCh * 2, true); dv.setUint16(32, nCh * 2, true);
		dv.setUint16(34, 16, true); w("data", 36); dv.setUint32(40, len * nCh * 2, true);
		var off = 44, chans = [];
		for (var c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
		for (var i = 0; i < len; i++)
			for (var c2 = 0; c2 < nCh; c2++) {
				var s = Math.max(-1, Math.min(1, chans[c2][i]));
				dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
			}
		return new Blob([ab], { type: "audio/wav" });
	}

	global.KSAudio = {
		init: ensure, set: set, get: get,
		charTrigger: charTrigger, drumByName: drumByName,
		piano: pianoNote, pianoOff: release,
		pluck: pluck, kick: kick, snare: snare, hat: hat, tom: tom,
		crash: crash, scratch: scratch,
		levels: levels, mtof: mtof, letterNote: letterNote,
		recStart: recStart, recStop: recStop,
		get ready() { return !!ctx; }
	};
})(window);