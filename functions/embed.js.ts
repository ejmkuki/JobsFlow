const appUrl = 'https://jobsflowai.ai'

// Served at /embed.js. Employers include:
//   <script src="https://jobsflowai.ai/embed.js" data-job="{slug}" async></script>
// This finds its own <script> tag via currentScript, reads data-job, and
// injects an iframe pointing at the public /embed/{slug} widget right where
// the script tag sits — no build step or account needed on the employer's side.
export async function onRequestGet() {
  const js = `(function(){
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute('data-job');
  if (!slug) return;
  var iframe = document.createElement('iframe');
  iframe.src = '${appUrl}/embed/' + encodeURIComponent(slug);
  iframe.style.width = '100%';
  iframe.style.maxWidth = '520px';
  iframe.style.border = '0';
  iframe.style.minHeight = '220px';
  iframe.setAttribute('title', 'JobsFlow AI job listing');
  iframe.setAttribute('loading', 'lazy');
  script.parentNode.insertBefore(iframe, script.nextSibling);
})();`

  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    },
  })
}
