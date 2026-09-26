// Canvas holo-globe carried over from the original single-page site; draws only while on screen.
export function initGlobe() {
  const gcEl = document.getElementById('globe');
  if (!gcEl) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var offices = [
    {city:'Dhaka',      country:'Bangladesh',    lat:23.81,  lon:90.41,   hub:true},
    {city:'Bengaluru',  country:'India',         lat:12.97,  lon:77.59,   hub:true},
    {city:'Hyderabad',  country:'India',         lat:17.39,  lon:78.49},
    {city:'Noida',      country:'India',         lat:28.54,  lon:77.39},
    {city:'Manila',     country:'Philippines',   lat:14.60,  lon:120.98,  hub:true},
    {city:'Cebu',       country:'Philippines',   lat:10.32,  lon:123.89},
    {city:'Davao',      country:'Philippines',   lat:7.07,   lon:125.61},
    {city:'Newark, NJ', country:'United States', lat:40.74,  lon:-74.17,  hub:true, hq:true},
    {city:'Chicago, IL',country:'United States', lat:41.88,  lon:-87.63},
    {city:'Austin, TX', country:'United States', lat:30.27,  lon:-97.74},
    {city:'Bratislava', country:'Slovakia',      lat:48.15,  lon:17.11,   hub:true},
    {city:'Kosice',     country:'Slovakia',      lat:48.72,  lon:21.26}
  ];
  // coarse land blocks (lat1,lat2,lon1,lon2) — stylised holo map, not a survey
  var LAND = [
    [60,71,-168,-141],[55,70,-140,-95],[48,62,-95,-62],[44,52,-80,-58],
    [30,49,-124,-96],[30,44,-96,-74],[25,31,-100,-81],[18,30,-108,-96],
    [8,18,-92,-82],[62,82,-52,-22],[17,23,-79,-70],
    [2,12,-79,-60],[-5,3,-78,-45],[-16,-4,-72,-36],[-28,-15,-70,-42],
    [-38,-28,-72,-53],[-52,-38,-73,-62],
    [36,44,-9,28],[44,55,-5,30],[55,66,5,29],[36,42,20,42],
    [21,35,-16,32],[10,22,-17,36],[0,10,-10,42],[-12,0,10,40],[-26,-12,12,38],[-35,-26,16,33],
    [15,32,34,58],[25,38,44,62],
    [50,68,30,178],[42,56,30,80],[38,52,80,130],[45,60,130,160],
    [8,28,70,88],[20,32,60,72],[22,35,88,105],[5,22,95,110],
    [-9,5,96,120],[-10,-2,120,140],[-9,0,130,150],
    [-33,-12,114,152],[-38,-30,116,150],[-46,-35,166,178],
    [31,43,130,143],[34,38,126,130],[18,26,110,122],
    [-90,-72,-180,180]
  ];
  var gc = document.getElementById('globe'), gx = gc.getContext('2d');
  var stage = gc.parentElement;
  var rot = 0, GW = 0, GH = 0;
  function sizeGlobe(){
    var r = gc.parentElement.getBoundingClientRect(), dpr = Math.min(devicePixelRatio||1,2);
    GW = r.width; GH = r.height;
    gc.width = GW*dpr; gc.height = GH*dpr; gx.setTransform(dpr,0,0,dpr,0,0);
  }
  // Motion (same model as the /technologies sphere): a slow idle spin with a breathing tilt,
  // a lean toward the pointer, drag/flick with momentum, and an eased turn to a hovered country.
  var TILT0 = 0.3, tilt = TILT0;           // viewed from a little above: every office is north of the equator
  var BASE = reduce ? 0 : 8;               // idle spin, degrees per second
  var vYaw = BASE;                         // degrees per second
  var hovering = false, dragging = false, focusLon = null;
  var lean = { x: 0, y: 0 };               // pointer offset from the centre, -1..1
  var clock = 0, last = performance.now();
  function advance(){
    var now = performance.now(), dt = Math.min((now - last) / 1000, 0.05);
    last = now; clock += dt;
    if (focusLon !== null) {
      // ease the shortest way round to the country, and hold it there
      var diff = ((-focusLon - rot + 540) % 360) - 180;
      rot += reduce ? diff : diff * Math.min(1, dt * 5);
      vYaw = 0;
    } else if (!dragging) {
      var tv = hovering && !reduce ? BASE + lean.x * 40 : BASE;
      vYaw += (tv - vYaw) * Math.min(1, dt * 1.6);
      rot += vYaw * dt;
    }
    if (!dragging && !reduce) {
      var tt = TILT0 + Math.sin(clock * 0.8) * 0.05 + (hovering ? lean.y * 0.35 : 0);
      tilt += (tt - tilt) * Math.min(1, dt * 2.2);
    }
  }
  function project(lat, lon, radius){
    var ph = lat*Math.PI/180, th = (lon + rot)*Math.PI/180;
    var x = Math.cos(ph)*Math.sin(th), y = Math.sin(ph), z = Math.cos(ph)*Math.cos(th);
    var y2 = y*Math.cos(tilt) - z*Math.sin(tilt);
    var z2 = y*Math.sin(tilt) + z*Math.cos(tilt);
    return {x: GW/2 + x*radius, y: GH/2 - y2*radius, z: z2};
  }
  function isLand(lat, lon){
    for(var i=0;i<LAND.length;i++){
      var b = LAND[i];
      if(lat>=b[0] && lat<=b[1] && lon>=b[2] && lon<=b[3]) return true;
    }
    return false;
  }
  function drawGlobe(){
    advance();
    var R = Math.min(GW,GH)*0.38;
    gx.clearRect(0,0,GW,GH);

    // graticule
    gx.lineWidth = 1;
    for(var lat=-60; lat<=60; lat+=30){
      gx.beginPath(); var started=false;
      for(var lon=-180; lon<=180; lon+=4){
        var p = project(lat,lon,R);
        if(p.z>0){ if(!started){gx.moveTo(p.x,p.y);started=true;} else gx.lineTo(p.x,p.y); }
        else started=false;
      }
      gx.strokeStyle='rgba(176,38,255,.16)'; gx.stroke();
    }
    for(var lo=-180; lo<180; lo+=30){
      gx.beginPath(); var st=false;
      for(var la=-88; la<=88; la+=4){
        var q = project(la,lo,R);
        if(q.z>0){ if(!st){gx.moveTo(q.x,q.y);st=true;} else gx.lineTo(q.x,q.y); }
        else st=false;
      }
      gx.strokeStyle='rgba(176,38,255,.12)'; gx.stroke();
    }

    // land dots
    for(var la2=-88; la2<=88; la2+=3){
      var step = 3/Math.max(Math.cos(la2*Math.PI/180),0.18);
      for(var lo2=-180; lo2<180; lo2+=step){
        if(!isLand(la2,lo2)) continue;
        var pt = project(la2,lo2,R);
        if(pt.z<=0.02) continue;
        gx.beginPath();
        gx.arc(pt.x,pt.y,1.1,0,6.283);
        gx.fillStyle='rgba(217,140,255,'+(0.16+pt.z*0.5)+')';
        gx.fill();
      }
    }

    // rim
    gx.beginPath(); gx.arc(GW/2,GH/2,R,0,6.283);
    var rim = reduce ? 0.45 : 0.4 + Math.sin(clock * 1.3) * 0.12;
    gx.strokeStyle='rgba(176,38,255,'+rim.toFixed(3)+')'; gx.lineWidth=1; gx.stroke();

    // arcs from HQ
    var hq = offices.filter(function(x){ return x.hq; })[0];
    for(var i=0;i<offices.length;i++){
      var o = offices[i];
      if(!o.hub || o===hq) continue;
      gx.beginPath(); var open=false;
      for(var t=0;t<=1.0001;t+=0.02){
        var la3 = hq.lat + (o.lat-hq.lat)*t;
        var lo3 = hq.lon + (o.lon-hq.lon)*t;
        var lift = 1 + 0.14*Math.sin(Math.PI*t);
        var a = project(la3,lo3,R*lift);
        if(a.z>0){ if(!open){gx.moveTo(a.x,a.y);open=true;} else gx.lineTo(a.x,a.y); }
        else open=false;
      }
      gx.strokeStyle='rgba(255,196,0,.42)'; gx.lineWidth=1; gx.stroke();
    }

    // markers
    for(var m=0;m<offices.length;m++){
      var o2 = offices[m], pm = project(o2.lat,o2.lon,R);
      if(pm.z<=0.04) continue;
      var col = o2.hq ? '255,196,0' : '176,38,255';

      if(!o2.hub){
        gx.beginPath(); gx.arc(pm.x,pm.y,2,0,6.283);
        gx.fillStyle='rgba('+col+',.85)'; gx.shadowBlur=8; gx.shadowColor='rgb('+col+')';
        gx.fill(); gx.shadowBlur=0;
        continue;
      }

      var pulse = reduce ? 0 : (Date.now()/900 + m) % 1;
      if(!reduce){
        gx.beginPath(); gx.arc(pm.x,pm.y,3+pulse*11,0,6.283);
        gx.strokeStyle='rgba('+col+','+(0.45*(1-pulse))+')'; gx.lineWidth=1; gx.stroke();
      }
      gx.beginPath(); gx.arc(pm.x,pm.y,3.2,0,6.283);
      gx.fillStyle='rgb('+col+')'; gx.shadowBlur=14; gx.shadowColor='rgb('+col+')'; gx.fill(); gx.shadowBlur=0;

      var flip = pm.x > GW*0.60 ? -1 : 1;
      gx.beginPath();
      gx.moveTo(pm.x,pm.y); gx.lineTo(pm.x+13*flip,pm.y-13); gx.lineTo(pm.x+47*flip,pm.y-13);
      gx.strokeStyle='rgba('+col+',.5)'; gx.lineWidth=1; gx.stroke();
      gx.font='500 11px "Chakra Petch", system-ui, sans-serif';
      gx.textAlign = flip>0 ? 'left' : 'right';
      gx.fillStyle='rgba(235,238,245,.92)';
      gx.fillText(o2.country.toUpperCase(), pm.x+16*flip, pm.y-17);
      gx.textAlign='left';
    }

    if(visible) requestAnimationFrame(drawGlobe); else running = false;
  }
  var visible = false, running = false;
  new IntersectionObserver(function(entries){
    visible = entries[0].isIntersecting;
    if(visible && !running){ running = true; last = performance.now(); requestAnimationFrame(drawGlobe); }
  }).observe(gc);
  sizeGlobe();
  window.addEventListener('resize', sizeGlobe);

  // pointer: lean, drag to spin, flick for momentum, click for a kick
  var px = 0, py = 0, pt = 0, moved = 0;
  stage.addEventListener('pointermove', function(e){
    var r = stage.getBoundingClientRect();
    lean = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * -2 };
    hovering = e.pointerType === 'mouse';
    if (!dragging) return;
    var R = Math.min(GW, GH) * 0.38, now = performance.now(), dts = Math.max((now - pt) / 1000, 0.008);
    var dx = e.clientX - px, dy = e.clientY - py;
    moved += Math.abs(dx) + Math.abs(dy);
    var d = dx / R * 180 / Math.PI;
    rot += d; vYaw = d / dts;
    tilt = Math.max(-0.6, Math.min(1.0, tilt + dy / R));
    px = e.clientX; py = e.clientY; pt = now;
  });
  stage.addEventListener('pointerleave', function(){ hovering = false; });
  stage.addEventListener('pointerdown', function(e){
    dragging = true; moved = 0; focusLon = null; px = e.clientX; py = e.clientY; pt = performance.now();
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  function end(e){
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('dragging');
    if (moved < 4 && !reduce) {
      var r = stage.getBoundingClientRect();
      vYaw += ((e.clientX - r.left) / r.width - 0.5) * 240;   // a click: kick away from the pointer side
    }
    vYaw = reduce ? 0 : Math.max(-360, Math.min(360, vYaw));
  }
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  document.querySelectorAll('.offices li').forEach((li) => {
    const lon = parseFloat(li.dataset.lon || '');
    if (isNaN(lon)) return;
    const on = () => { focusLon = lon; };
    const off = () => { if (focusLon === lon) { focusLon = null; vYaw = 0; } };
    li.addEventListener('mouseenter', on);
    li.addEventListener('focus', on);
    li.addEventListener('mouseleave', off);
    li.addEventListener('blur', off);
  });
}
