#!/usr/bin/env python3
"""Build MailHub's standalone demo from its real HTML, CSS and browser code."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
PRODUCT = ROOT / 'products/mailhub'


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f'MailHub UI changed; review demo substitution: {old[:75]}')
    return source.replace(old, new, 1)


def build():
    page = (PRODUCT / 'static/index.html').read_text()
    style = (PRODUCT / 'static/style.css').read_text()
    script = (PRODUCT / 'static/app.js').read_text()
    adapter = (PRODUCT / 'demo/adapter.js').read_text()
    # Keep the application's screens and handlers; substitute only the data
    # transport, authentication bootstrap, preview isolation and simulation copy.
    script, count = re.subn(r'^let contactOffset=.*?;\n',
        "let contactOffset=0,token='demo',resetCode='',emailReset=false,editing=null,lists=[],segs=[],camps=[];\n", script, count=1)
    assert count == 1
    script, count = re.subn(r'async function api\(path,opts=\{\}\)\{.*?\n\}',
        'async function api(path,opts={}){return mailhubDemo.request(path,opts)}', script, count=1, flags=re.S)
    assert count == 1
    for function in ('auth', 'forgotPassword', 'resetPassword'):
        script, count = re.subn(r'^const ' + function + r'=guard\(.*\n', '', script, count=1, flags=re.M)
        assert count == 1
    script, count = re.subn(r'^function logout\(\).*\n', 'function logout(){resetDemo()}\n', script, count=1, flags=re.M)
    assert count == 1
    script, count = re.subn(r'async function init\(\).*?\ninit\(\);\s*$', '', script, count=1, flags=re.S)
    assert count == 1
    script = replace_once(script, "$('draftFrame').srcdoc=$('cBody').value", "$('draftFrame').srcdoc=demoEmailPreview($('cBody').value)")
    script = replace_once(script, "$('preview').srcdoc=c.body_html", "$('preview').srcdoc=demoEmailPreview(c.body_html)")
    script = replace_once(script, "b('Send test','testCampaign')", "b('Simulate test','testCampaign')")
    script = replace_once(script, "b('Send','sendCampaign','')", "b('Simulate send','sendCampaign','')")
    script = replace_once(script, "prompt('Send a test to')", "prompt('Preview a test for this address (no email will be sent)', 'reader@example.com')")
    script = replace_once(script, "msg('Test sent to '+email)", "msg('Test simulated for '+email+'. No email was sent.')")
    script = replace_once(script, 'This reaches ${a.recipients} people.', 'This sample campaign reaches ${a.recipients} people.')
    script = replace_once(script, "Send to ${a.recipients} people now? This can't be undone.", 'Simulate sending to ${a.recipients} people now? No email will be sent.')
    script = replace_once(script, "msg(at?'Scheduled.':'Sending has started.')", "msg(at?'Sample campaign scheduled. Nothing will be sent.':'Queued in this demo. Choose Run simulated worker to complete it; no email will be sent.')")
    script = replace_once(script, '${p.used} of ${p.limit} sends this month', '${p.used} of ${p.limit} sample sends')
    script = replace_once(script, 'You are ready to send.', 'Sample setup ready for simulated sending.')
    script = replace_once(script, "function tab(name){", "function tab(name){document.querySelectorAll('nav [data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'));")
    script += r'''
async function resetDemo(){
 mailhubDemo.reset();contactOffset=0;editing=null;lists=[];segs=[];camps=[];
 for(const e of document.querySelectorAll('main input,main textarea')){if(e.type==='checkbox')e.checked=false;else e.value=''}
 $('draftPreview').classList.add('hidden');$('statsPanel').classList.add('hidden');
 await start();await loadCampaigns();editCampaign('c1');
 msg('Sample draft loaded. Explore MailHub’s own screens; all changes reset when you reload.');
}
const runDemoWorker=guard(async()=>{const count=mailhubDemo.runWorker();await loadCampaigns();msg(count?`${count} sample campaign(s) completed in memory. No email was sent.`:'No queued campaigns are due. Scheduled campaigns wait for their selected time. No email was sent.')});
function downloadDemoCsv(){
 const csv='email,first_name,last_name,tags\r\nnew-reader@example.com,Casey,Example,newsletter|vip\r\ntaylor@example.com,Taylor,Demo,newsletter\r\n';
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');
 a.href=url;a.download='mailhub-sample-contacts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const demoReady=resetDemo();
'''
    page = replace_once(page, '<title>MailHub</title>', '<title>MailHub · Application demo</title><meta name="description" content="Try MailHub’s actual email-marketing interface with fictional contacts and simulated sending.">')
    page = replace_once(page, '<link rel="stylesheet" href="/static/style.css">', '<style>' + style + '''
.demo-banner{padding:18px 20px;margin-bottom:24px;border:1px solid #386688;border-radius:12px;background:#10283b}.demo-banner strong{color:#9fd6ff}.demo-banner p{margin:8px 0 14px;font-size:14px}.demo-banner .row{gap:8px}.demo-banner a{color:#9fd6ff}.demo-banner button{padding:8px 12px}nav{align-content:start}nav [aria-current=page]{background:#1e3b53;color:#b8e4ff}#sKey,#sSecret{display:none!important}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #f1c783;outline-offset:3px}button:disabled{opacity:.5;cursor:not-allowed}iframe{max-width:100%}.demo-note{color:#8fc9ed;font-size:13px}@media(max-width:520px){aside{padding:18px 14px;gap:8px}nav{gap:0}nav button{padding:9px 7px;font-size:13px}main{padding:14px}.panel{padding:16px}.row>input{min-width:0;flex-basis:100%}.row>select{width:100%;min-width:0}.tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tile{padding:12px}.tile strong{font-size:25px}.demo-banner{padding:14px}.small,code{overflow-wrap:anywhere}.row>label{white-space:normal}}
</style>''')
    page = replace_once(page, '<button class="outline" onclick="logout()">Sign out</button>', '<button class="outline" id="demoReset" onclick="resetDemo()">Reset demo</button><a href="/products" style="color:#9fd6ff">Back to products</a>')
    page = replace_once(page, '<main><header>', '''<main><div class="demo-banner"><strong>MAILHUB APPLICATION DEMO</strong><p>The same interface as the MailHub application, with fictional lists, contacts, campaigns, and sender settings. No sign-in, real credentials, or email delivery. Changes last only until reset or reload.</p><div class="row"><button class="outline" id="demoWorker" onclick="runDemoWorker()">Run simulated worker</button><button class="outline" onclick="downloadDemoCsv()">Download sample CSV</button></div></div><header>''')
    page, count = re.subn(r'<section id="auth".*?</section>', '<section id="auth" class="hidden"></section>', page, count=1, flags=re.S)
    assert count == 1
    page, count = re.subn(r'<section id="reset".*?</section>', '', page, count=1, flags=re.S)
    assert count == 1
    for name in ('campaigns', 'contacts', 'segments', 'suppressed', 'settings'):
        page = replace_once(page, f'<button onclick="tab(\'{name}\')">', f'<button data-tab="{name}" onclick="tab(\'{name}\')">')
    page = replace_once(page, '<h2>Before you can send</h2>', '<h2>Sample sending setup</h2><p class="demo-note">Connection and DNS results are simulated. Do not enter real credentials or install the displayed sample DNS record.</p>')
    page = replace_once(page, '<input id="sKey"', '<input disabled hidden id="sKey"')
    page = replace_once(page, '<input id="sSecret"', '<input disabled hidden id="sSecret"')
    page = page.replace('<h2>Preview</h2>', '<h2>Preview · sample recipient Alex</h2>')
    page = replace_once(page, '<p id="domainStatus"></p>', '<p class="demo-note">Add domain and Check DNS only change this sample session. No DNS lookup is performed.</p><p id="domainStatus"></p>')
    combined = (adapter + '\n' + script).replace('</script', '<\\/script')
    page = replace_once(page, '<script src="/static/app.js"></script>', '<script>' + combined + '</script>')
    if 'fetch(' in combined or 'localStorage' in combined or 'sessionStorage' in combined:
        raise ValueError('Demo must not use live network requests or browser storage')
    return page


if __name__ == '__main__':
    output = PRODUCT / 'demo.html'
    output.write_text(build())
    print('Built MailHub application demo from its real UI and in-memory adapter.')
