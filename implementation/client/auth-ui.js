'use strict';
let authBusy=false,authVerifying=false;
function clearAuthConsentError(){
 $('#authConsentGroup')?.classList.remove('invalid');$('#consentProcessing')?.removeAttribute('aria-invalid');
 const error=$('#authConsentError');if(error){error.hidden=true;error.textContent='';}
}
function requireAuthConsent(){
 if($('#consentProcessing').checked){clearAuthConsentError();return true;}
 const group=$('#authConsentGroup'),error=$('#authConsentError');
 group.classList.add('invalid');error.textContent='Чтобы войти, отметьте согласие с условиями демо.';error.hidden=false;
 $('#consentProcessing').setAttribute('aria-invalid','true');$('#consentProcessing').focus();group.scrollIntoView({block:'center',behavior:'smooth'});return false;
}
function clearAuthFeedback(){for(const id of ['authFeedback','authCodeFeedback']){const el=$('#'+id);if(el){el.textContent='';if(id==='authFeedback')el.hidden=true;}}}
function showAuthError(message){
 const second=$('#authStage2').classList.contains('active'),stage=$('#authStage'+(second?2:1));let el=second?$('#authCodeFeedback'):$('#authFeedback');
 if(!el){el=document.createElement('div');el.id='authFeedback';el.className='auth-feedback field-error';el.setAttribute('role','alert');stage.append(el);}
 el.textContent=message;el.hidden=false;el.tabIndex=-1;el.focus();el.scrollIntoView({block:'center',behavior:'smooth'});
}
function setAuthBusy(busy,example=false){
 authBusy=busy;for(const el of $$('#authCodeButton,#authReadyButton,#authSsoButton')){el.disabled=busy;el.setAttribute('aria-busy',String(busy));}
 $('#authCodeButton').textContent=busy&&!example?'Получаем код…':'Войти по коду';const ready=$('#authReadyButton');if(ready)ready.textContent=busy&&example?'Открываем…':'Войти без кода';
}
function updateDemoEntry(){
 const employer=authRole==='employer';for(const [id,role] of [['authCandidate','candidate'],['authEmployer','employer']])$('#'+id).setAttribute('aria-pressed',String(authRole===role));
 const title=$('#authReadyTitle'),description=$('#authReadyDescription');if(title)title.textContent='Быстрый вход';
 if(description)description.textContent=employer?'employer@oop.test · команда «Маяк»':'talent-demo@oop.test · Наталья Романова';
 $('#authEmailHint').textContent=meta.email_demo?(employer?'Для показа: employer@oop.test. Код входа — 123456.':'Для показа: talent-demo@oop.test. Код входа — 123456.'):'Укажите email, чтобы получить код входа.';
}
function resetAuthForm(){challenge=null;$('#consentProcessing').checked=false;clearAuthConsentError();clearAuthFeedback();codeInputs().forEach(x=>x.value='');selectAuthRole(authRole);setAuthBusy(false);showAuthStage(1);}
function startSso(){
 clearAuthFeedback();if(authBusy||!requireAuthConsent())return;
 const q=new URLSearchParams({consent:'registration-0.8-demo',login_hint:$('#authEmail').value.trim()});location.assign('/api/v1/auth/oidc/login?'+q.toString());
}
function configureAuth(){
 const stage=$('#authStage1'),talentIcon=$('#authCandidate .icon-circle').outerHTML,employerIcon=$('#authEmployer .icon-circle').outerHTML;
 stage.innerHTML=`<div class="eyebrow">Демонстрация ООП</div><h2>Посмотрите сервис в работе</h2>
 <p class="small muted">Выберите роль и войдите по коду. Для знакомства с проектом уже подготовлены профиль таланта и кабинет работодателя.</p>
 <div class="auth-mode">
 <button type="button" id="authCandidate" class="role-choice active" aria-pressed="true" onclick="selectAuthRole('candidate')">${talentIcon}<b>Я талант</b><p>Профиль, результаты оценки и предложения от команд.</p></button>
 <button type="button" id="authEmployer" class="role-choice" aria-pressed="false" onclick="selectAuthRole('employer')">${employerIcon}<b>Я работодатель</b><p>Задачи команды, подбор талантов и отклики.</p></button>
 </div>
 <div class="field"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" aria-describedby="authEmailHint"><div id="authEmailHint" class="field-hint"></div></div>
 <div id="authConsentGroup" class="auth-consent"><label class="radio-card" for="consentProcessing"><input id="consentProcessing" type="checkbox" aria-describedby="authConsentHint authConsentError"> Согласен с условиями демонстрации сервиса.</label><p id="authConsentHint" class="tiny muted">В примерах — вымышленные данные. Публикация профиля выполняется отдельно.</p><p id="authConsentError" class="auth-consent-error" role="alert" hidden></p></div>
 <div id="authFeedback" class="auth-feedback field-error" role="alert" hidden></div>
 <button id="authCodeButton" type="button" class="btn auth-primary" onclick="sendEmailCode()">Войти по коду</button>
 ${meta.email_demo?'<div class="auth-divider">или</div><div class="auth-demo auth-ready"><div><b id="authReadyTitle" class="small"></b><p id="authReadyDescription" class="tiny muted"></p><p class="tiny muted">Тот же аккаунт и демо-данные, что при входе по коду.</p></div><button id="authReadyButton" type="button" class="btn secondary sm" onclick="demoEnter()">Войти без кода</button></div>':''}
 ${meta.auth_mode==='keycloak'?'<details class="auth-sso"><summary>Другой способ входа · Keycloak</summary><p class="tiny muted">Единый вход тоже реализован. Он откроет тот же профиль, который выбран выше.</p><p class="tiny muted">Пароль демо-профилей: <b>OopDemo2026!</b>. У оператора — отдельный пароль.</p><button id="authSsoButton" type="button" class="btn secondary sm" onclick="startSso()">Войти через Keycloak</button></details>':''}
 <footer class="auth-legal"><button type="button" class="text-button" onclick="showLegal('registration')">Условия демо и документ регистрации</button></footer>`;
 $('#authStage2 h2').textContent='Введите код входа';$('#authStage2 .eyebrow').textContent='Вход по коду';
 $('#authStage2 p.small').innerHTML=meta.email_demo?'Для <b id="authEmailPreview"></b> используйте демонстрационный код <b>123456</b>.':'Отправили код на <b id="authEmailPreview"></b>. Введите его, чтобы продолжить.';
 const verify=$('#authStage2 button[onclick="verifyEmailCode()"]');verify.id='authVerifyButton';
 for(const input of codeInputs())input.inputMode='numeric';
 $('#consentProcessing').addEventListener('change',clearAuthConsentError);$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.sendEmailCode();}});selectAuthRole('candidate');
 const params=new URLSearchParams(location.search);if(params.has('auth_error')){showAuthError(params.get('auth_error')==='sso_cancelled'?'Вход отменён. Можно войти по коду.':'Не удалось завершить единый вход. Повторите его или войдите по коду.');history.replaceState(null,'',location.pathname);}
}
