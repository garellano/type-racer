import { CHARACTERS, type CharacterId } from "../shared/characters";

export class CharacterPicker {
  private readonly buttons = new Map<CharacterId, HTMLButtonElement>();

  constructor(root: HTMLElement, choose: (id: CharacterId) => void) {
    for (const avatar of CHARACTERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-option";
      button.setAttribute("aria-label", `Choose character: ${avatar.detail}`);
      button.setAttribute("aria-pressed", "false");
      const portrait = document.createElement("span");
      portrait.className = "character-portrait";
      portrait.setAttribute("aria-hidden", "true");
      portrait.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/sacks/${avatar.id}.webp")`;
      button.append(portrait);
      button.addEventListener("click", () => choose(avatar.id));
      this.buttons.set(avatar.id, button);
      root.append(button);
    }
  }

  render(selected: CharacterId, enabled: boolean): void {
    for (const [id, button] of this.buttons) {
      button.setAttribute("aria-pressed", String(id === selected));
      button.disabled = !enabled;
    }
  }
}
