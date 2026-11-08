import confetti from 'canvas-confetti';

export function celebrateSale() {
  // 🎉 confete por 5 segundos
  const duration = 5000;
  const end = Date.now() + duration;
  const colors = ['#B8892B', '#8B5CF6', '#ffffff', '#FFD700'];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();

  // 💰 Caixa registradora ka-ching + moedas caindo (sintetizado)
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    // Retoma o contexto (nasce suspenso). Funciona quando a página já teve
    // interação do usuário (ex.: clique que ativou o modo apresentação).
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);

    // ===== 1) "Ding" agudo da caixa registradora =====
    const dingFreqs = [1760, 2637]; // A6 + E7 (intervalo brilhante metálico)
    dingFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.5, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 1);
    });

    // ===== 2) "Chunk" da gaveta abrindo (ruído curto grave) =====
    const drawerStart = now + 0.18;
    const drawerDur = 0.25;
    const dBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * drawerDur), ctx.sampleRate);
    const dData = dBuf.getChannelData(0);
    for (let i = 0; i < dData.length; i++) dData[i] = (Math.random() * 2 - 1) * 0.7;
    const dSrc = ctx.createBufferSource();
    dSrc.buffer = dBuf;
    const dFilt = ctx.createBiquadFilter();
    dFilt.type = 'lowpass';
    dFilt.frequency.value = 400;
    const dGain = ctx.createGain();
    dGain.gain.setValueAtTime(0, drawerStart);
    dGain.gain.linearRampToValueAtTime(0.35, drawerStart + 0.02);
    dGain.gain.exponentialRampToValueAtTime(0.0001, drawerStart + drawerDur);
    dSrc.connect(dFilt).connect(dGain).connect(master);
    dSrc.start(drawerStart);
    dSrc.stop(drawerStart + drawerDur);

    // ===== 3) Moedas caindo: vários "tinks" agudos aleatórios =====
    const coinFreqs = [3200, 2800, 3600, 2400, 3000, 2600, 3400, 2900];
    for (let i = 0; i < 10; i++) {
      const start = now + 0.45 + Math.random() * 1.2;
      const freq = coinFreqs[i % coinFreqs.length] + (Math.random() - 0.5) * 400;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = freq * 1.5;
      const g = ctx.createGain();
      const peak = 0.18 + Math.random() * 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, start);
      g2.gain.linearRampToValueAtTime(peak * 0.15, start + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(g).connect(master);
      osc2.connect(g2).connect(master);
      osc.start(start);
      osc2.start(start);
      osc.stop(start + 0.2);
      osc2.stop(start + 0.2);
    }

    setTimeout(() => ctx.close().catch(() => {}), 3000);
  } catch {
    // silencioso se o navegador bloquear áudio
  }
}
