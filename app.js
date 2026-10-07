const state = {
  recipes: [],
  aliases: {},
  reverseAliases: {},
  favorites: new Set(JSON.parse(localStorage.getItem('polarisFavorites') || '[]')),
  selectedIngredients: new Set(),
  category: null,
  currentRecipe: null,
  cookStep: 0,
  checkedSteps: new Set()
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pantry = new Set(['соль','черный перец','масло растительное','масло сливочное','вода','сахар']);

function norm(v) {
  return String(v ?? '').toLowerCase().trim().replace(/ё/g, 'е');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function prettyName(v) {
  return String(v).replace(/^./, c => c.toUpperCase());
}

function canonicalize(value) {
  const v = norm(value);
  return state.aliases[v] || v;
}

function buildAliasMap(raw) {
  state.aliases = {};
  for (const [canonical, aliases] of Object.entries(raw || {})) {
    const c = norm(canonical);
    state.aliases[c] = c;
    for (const alias of (Array.isArray(aliases) ? aliases : [])) state.aliases[norm(alias)] = c;
  }
}

function saveFav() {
  localStorage.setItem('polarisFavorites', JSON.stringify([...state.favorites]));
  updateFavCount();
}

function updateFavCount() {
  const el = $('#favCount');
  if (el) el.textContent = state.favorites.size || '';
}

function allIngredients() {
  const map = new Map();
  for (const recipe of state.recipes) {
    for (const raw of Object.keys(recipe.ingredients || {})) {
      const id = canonicalize(raw);
      if (!map.has(id)) map.set(id, { id, name: prettyName(id), count: 0 });
      map.get(id).count++;
    }
  }
  return [...map.values()].sort((a,b) => a.name.localeCompare(b.name, 'ru'));
}

function searchableRecipe(recipe) {
  const parts = [recipe.title, recipe.category, recipe.mode, ...(recipe.tags || []), ...(recipe.ingredient_tags || []), recipe.search_text];
  for (const raw of Object.keys(recipe.ingredients || {})) {
    const id = canonicalize(raw);
    parts.push(raw, id, ...(Object.entries(state.aliases).filter(([,v]) => v === id).map(([a]) => a)));
  }
  return norm(parts.filter(Boolean).join(' '));
}

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const target = $('#' + id);
  if (!target) return;
  target.classList.add('active');
  const navId = ['homeView','ingredientsView','indexView','favoritesView'].includes(id) ? id : 'homeView';
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === navId));
  window.scrollTo(0, 0);
}

function renderCategories() {
  const cats = [...new Set(state.recipes.map(r => r.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ru'));
  $('#categories').innerHTML = cats.map(c => `<button class="chip ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $$('[data-cat]').forEach(b => b.addEventListener('click', () => {
    state.category = state.category === b.dataset.cat ? null : b.dataset.cat;
    renderCategories();
    renderHome();
  }));
}

function recipeHtml(recipe, missing = null) {
  const fav = state.favorites.has(recipe.id);
  return `<div class="recipe-item" data-recipe="${esc(recipe.id)}" role="button" tabindex="0">
    <button class="fav-btn" data-fav="${esc(recipe.id)}" aria-label="Избранное">${fav ? '★' : '☆'}</button>
    <h3>${esc(recipe.title)}</h3>
    <div class="recipe-meta"><span>⏱ ${recipe.time_minutes || '?'} мин</span><span>⚙ ${esc(recipe.mode || '—')}</span><span>${esc(recipe.category || '')}</span>${missing !== null ? `<span>Не хватает: ${missing}</span>` : ''}</div>
  </div>`;
}

function bindRecipeItems() {
  $$('[data-recipe]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-fav]')) return;
      openRecipe(item.dataset.recipe);
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecipe(item.dataset.recipe); }
    });
  });
  $$('[data-fav]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    toggleFav(btn.dataset.fav);
  }));
}

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFav();
  renderHome();
  renderFavorites();
  if (state.currentRecipe?.id === id) updateRecipeFav();
}

function renderHome() {
  const q = norm($('#searchInput').value);
  const list = state.recipes.filter(r => {
    if (state.category && r.category !== state.category) return false;
    return !q || searchableRecipe(r).includes(q);
  });
  $('#resultsTitle').textContent = state.category || 'Все рецепты';
  $('#resultsCount').textContent = `${list.length} ${plural(list.length,'рецепт','рецепта','рецептов')}`;
  $('#recipeList').innerHTML = list.map(recipeHtml).join('') || empty('Ничего не найдено');
  bindRecipeItems();
}

function renderFavorites() {
  const list = state.recipes.filter(r => state.favorites.has(r.id));
  $('#favoritesList').innerHTML = list.map(recipeHtml).join('') || empty('Пока нет избранных рецептов');
  bindRecipeItems();
}

function openRecipe(id) {
  const recipe = state.recipes.find(r => String(r.id) === String(id));
  if (!recipe) return;
  state.currentRecipe = recipe;
  state.checkedSteps = new Set();
  const ingredients = Object.entries(recipe.ingredients || {});
  const steps = recipe.steps || [];
  $('#recipeCard').innerHTML = `
    <div class="recipe-hero"><div class="muted">${esc(recipe.category || '')}</div><h2>${esc(recipe.title)}</h2>
      <div class="recipe-stats"><span class="stat">⏱ ${recipe.time_minutes || '?'} мин</span><span class="stat">⚙ ${esc(recipe.mode || '—')}</span>${recipe.temperature_c ? `<span class="stat">🌡 ${recipe.temperature_c}°C</span>` : ''}</div>
    </div>
    <details class="accordion" open><summary>Ингредиенты</summary><div class="accordion-body">${ingredients.map(([k,v]) => `<div class="ingredient-line"><span>${esc(prettyName(canonicalize(k)))}</span><b>${esc(v)}</b></div>`).join('')}</div></details>
    <details class="accordion" open><summary>Приготовление</summary><div class="accordion-body">${steps.map((s,i) => `<label class="check-step"><input type="checkbox" data-step="${i}"><span><b>${i+1}.</b> ${esc(s)}</span></label>`).join('')}<button id="startCook" class="cook-btn">▶ Готовить пошагово</button></div></details>
    ${recipe.tags?.length ? `<details class="accordion"><summary>Теги</summary><div class="accordion-body muted">${recipe.tags.map(esc).join(' · ')}</div></details>` : ''}`;
  $$('[data-step]').forEach(c => c.addEventListener('change', () => c.checked ? state.checkedSteps.add(+c.dataset.step) : state.checkedSteps.delete(+c.dataset.step)));
  $('#startCook').addEventListener('click', startCooking);
  updateRecipeFav();
  showView('recipeView');
}

function updateRecipeFav() {
  $('#favoriteRecipe').textContent = state.favorites.has(state.currentRecipe?.id) ? '★' : '☆';
}

function startCooking() {
  state.cookStep = 0;
  state.checkedSteps = new Set();
  renderCook();
  showView('cookView');
}

function renderCook() {
  const steps = state.currentRecipe?.steps || [];
  const done = steps.length ? Math.min(state.cookStep + 1, steps.length) : 0;
  $('#cookTitle').textContent = state.currentRecipe?.title || '';
  $('#cookProgress').textContent = `${done} / ${steps.length}`;
  $('#cookStep').textContent = steps[state.cookStep] || 'Готово!';
  $('#prevStep').disabled = state.cookStep === 0;
  $('#nextStep').textContent = state.cookStep === steps.length - 1 ? '✓' : '→';
  $('#stepDone').textContent = state.checkedSteps.has(state.cookStep) ? 'Выполнено ✓' : 'Готово ✓';
  $('#cookDots').innerHTML = steps.map((_,i) => `<span class="dot ${i === state.cookStep ? 'active' : ''}"></span>`).join('');
}

function step(delta) {
  const steps = state.currentRecipe?.steps || [];
  if (!steps.length) return;
  if (delta > 0 && state.cookStep < steps.length - 1) { state.checkedSteps.add(state.cookStep); state.cookStep++; }
  else if (delta < 0 && state.cookStep > 0) state.cookStep--;
  renderCook();
}

function renderIngredientFilter() {
  const q = norm($('#ingredientSearch').value);
  const items = allIngredients().filter(x => norm(x.name).includes(q));
  $('#ingredientFilter').innerHTML = items.map(x => `<button class="ingredient-check ${state.selectedIngredients.has(x.id) ? 'selected' : ''}" data-ing="${esc(x.id)}">${esc(x.name)}<small>${x.count} ${plural(x.count,'рецепт','рецепта','рецептов')}</small></button>`).join('') || empty('Ингредиенты не найдены');
  $$('[data-ing]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.ing;
    state.selectedIngredients.has(id) ? state.selectedIngredients.delete(id) : state.selectedIngredients.add(id);
    renderIngredientFilter();
    renderIngredientResults();
  }));
  $('#selectedCount').textContent = state.selectedIngredients.size ? `Выбрано: ${state.selectedIngredients.size}` : '';
}

function renderIngredientResults() {
  const selected = [...state.selectedIngredients];
  const ranked = state.recipes.map(r => {
    const ids = new Set(Object.keys(r.ingredients || {}).map(canonicalize));
    const missing = selected.filter(x => !ids.has(x) && !pantry.has(x)).length;
    const matched = selected.filter(x => ids.has(x) || pantry.has(x)).length;
    return { r, missing, matched };
  }).filter(x => selected.length === 0 || x.matched === selected.length)
    .sort((a,b) => a.missing - b.missing || a.r.time_minutes - b.r.time_minutes || a.r.title.localeCompare(b.r.title,'ru'));
  $('#matchCount').textContent = `${ranked.length} ${plural(ranked.length,'рецепт','рецепта','рецептов')}`;
  $('#ingredientResults').innerHTML = ranked.map(x => recipeHtml(x.r, x.missing)).join('') || empty('Нет рецептов со всеми выбранными продуктами');
  bindRecipeItems();
}

function renderIndex() {
  const q = norm($('#indexSearch').value);
  const items = allIngredients().filter(x => norm(x.name).includes(q));
  let last = '', html = '';
  for (const x of items) {
    const letter = x.name[0].toUpperCase();
    if (letter !== last) { last = letter; html += `<div class="index-letter">${esc(letter)}</div>`; }
    html += `<button class="index-item" data-index-ing="${esc(x.id)}"><span>${esc(x.name)}</span><span class="muted">${x.count}</span></button>`;
  }
  $('#subjectIndex').innerHTML = html || empty('Ничего не найдено');
  $$('[data-index-ing]').forEach(b => b.addEventListener('click', () => {
    state.selectedIngredients = new Set([b.dataset.indexIng]);
    showView('ingredientsView');
    $('#ingredientSearch').value = '';
    renderIngredientFilter();
    renderIngredientResults();
  }));
}

function empty(t) { return `<div class="recipe-item muted">${esc(t)}</div>`; }
function plural(n,a,b,c) { const x=n%100; return x>=11&&x<=19?c:(n%10===1?a:(n%10>=2&&n%10<=4?b:c)); }

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}

async function init() {
  try {
    const base = new URL('.', document.baseURI);
    const recipesUrl = new URL('data/recipes.json?v=' + Date.now(), base);
    const response = await fetch(recipesUrl.href, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    state.recipes = Array.isArray(data.recipes) ? data.recipes : [];
    buildAliasMap(data.ingredient_aliases || {});
    renderCategories();
    renderHome();
    renderIngredientFilter();
    renderIngredientResults();
    renderIndex();
    updateFavCount();
    registerSW();
    document.body.classList.add('ready');
  } catch (e) {
    console.error(e);
    $('#recipeList').innerHTML = empty('Не удалось загрузить базу. Проверьте, что data/recipes.json загружен в репозиторий рядом с index.html. Ошибка: ' + (e.message || e));
  }
}

$('#searchInput').addEventListener('input', renderHome);
$('#ingredientSearch').addEventListener('input', renderIngredientFilter);
$('#indexSearch').addEventListener('input', renderIndex);
$('#clearIngredients').addEventListener('click', () => { state.selectedIngredients.clear(); renderIngredientFilter(); renderIngredientResults(); });
$('#allRecipesBtn').addEventListener('click', () => { state.category = null; renderCategories(); renderHome(); });
$('#favoritesBtn').addEventListener('click', () => { showView('favoritesView'); renderFavorites(); });
$('#favoriteRecipe').addEventListener('click', () => { if (state.currentRecipe) toggleFav(state.currentRecipe.id); });
$('#recipeBack').addEventListener('click', () => showView('homeView'));
$('#cookBack').addEventListener('click', () => showView('recipeView'));
$('#prevStep').addEventListener('click', () => step(-1));
$('#nextStep').addEventListener('click', () => step(1));
$('#stepDone').addEventListener('click', () => { state.checkedSteps.add(state.cookStep); if (state.cookStep < (state.currentRecipe?.steps?.length || 1)-1) state.cookStep++; renderCook(); });
$$('[data-action]').forEach(b => b.addEventListener('click', () => { const a=b.dataset.action; showView(a==='ingredients'?'ingredientsView':'indexView'); a==='ingredients'?renderIngredientFilter():renderIndex(); }));
$$('[data-back]').forEach(b => b.addEventListener('click', () => showView('homeView')));
$$('[data-nav]').forEach(b => b.addEventListener('click', () => { const id=b.dataset.nav; showView(id); if(id==='favoritesView')renderFavorites(); if(id==='ingredientsView'){renderIngredientFilter();renderIngredientResults();} if(id==='indexView')renderIndex(); }));

let sx=0;
$('#cookStep').addEventListener('touchstart', e => sx=e.changedTouches[0].screenX, {passive:true});
$('#cookStep').addEventListener('touchend', e => { const dx=e.changedTouches[0].screenX-sx; if(Math.abs(dx)>60) step(dx<0?1:-1); }, {passive:true});

init();
