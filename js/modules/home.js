/* Home — will become the summary of the day once the other modules exist. */

export default {
  id: 'home',
  name: 'Home',
  icon: '⌂',
  tabs: [],
  render(el) {
    el.innerHTML = `
      <div class="text-center text-mut text-sm py-16 border border-dashed border-line rounded-2xl">
        Your day will be summarised here.<br>Nothing to show yet.
      </div>`;
  },
};
