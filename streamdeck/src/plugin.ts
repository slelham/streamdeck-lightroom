import streamDeck from "@elgato/streamdeck";

import { CommandAction } from "./actions/command";
import { ConnectionAction, wireConnectionUpdates } from "./actions/connection";
import { FlagAction } from "./actions/flag";
import { FlagCountAction } from "./actions/flag-count";
import { LabelAction } from "./actions/label";
import { LabelFilterAction } from "./actions/label-filter";
import { NavigateAction } from "./actions/navigate";
import { PresetApplyAction } from "./actions/preset-apply";
import { PresetNavAction } from "./actions/preset-nav";
import { PresetSlotAction } from "./actions/preset-slot";
import { RatingAction } from "./actions/rating";
import { SliderAction } from "./actions/slider";
import { SliderDialAction } from "./actions/slider-dial";
import { bridge } from "./bridge/client";

const connectionAction = new ConnectionAction();
const ratingAction = new RatingAction();
const flagAction = new FlagAction();
const labelAction = new LabelAction();
const navigateAction = new NavigateAction();
const sliderAction = new SliderAction();
const sliderDialAction = new SliderDialAction();
const commandAction = new CommandAction();
const presetNavAction = new PresetNavAction();
const presetSlotAction = new PresetSlotAction();
const presetApplyAction = new PresetApplyAction();
const labelFilterAction = new LabelFilterAction();
const flagCountAction = new FlagCountAction();

streamDeck.actions.registerAction(connectionAction);
streamDeck.actions.registerAction(ratingAction);
streamDeck.actions.registerAction(flagAction);
streamDeck.actions.registerAction(labelAction);
streamDeck.actions.registerAction(navigateAction);
streamDeck.actions.registerAction(sliderAction);
streamDeck.actions.registerAction(sliderDialAction);
streamDeck.actions.registerAction(commandAction);
streamDeck.actions.registerAction(presetNavAction);
streamDeck.actions.registerAction(presetSlotAction);
streamDeck.actions.registerAction(presetApplyAction);
streamDeck.actions.registerAction(labelFilterAction);
streamDeck.actions.registerAction(flagCountAction);

wireConnectionUpdates(connectionAction);

bridge.on("state", () => {
  for (const a of ratingAction.actions) {
    void a.getSettings().then((settings) => ratingAction.paint(a, settings));
  }
  for (const a of flagAction.actions) {
    void a.getSettings().then((settings) => flagAction.paint(a, settings));
  }
  for (const a of labelAction.actions) {
    void a.getSettings().then((settings) => labelAction.paint(a, settings));
  }
  for (const a of navigateAction.actions) {
    void a.getSettings().then((settings) => navigateAction.paint(a, settings));
  }
  for (const a of sliderAction.actions) {
    void a.getSettings().then((settings) => sliderAction.paint(a, settings));
  }
  for (const a of sliderDialAction.actions) {
    void a.getSettings().then((settings) => sliderDialAction.paint(a, settings));
  }
  for (const a of presetNavAction.actions) {
    void a.getSettings().then((settings) => presetNavAction.paint(a, settings));
  }
  for (const a of presetSlotAction.actions) {
    void a.getSettings().then((settings) => presetSlotAction.paint(a, settings));
  }
  for (const a of labelFilterAction.actions) {
    void a.getSettings().then((settings) => labelFilterAction.paint(a, settings));
  }
  for (const a of flagCountAction.actions) {
    void a.getSettings().then((settings) => flagCountAction.paint(a, settings));
  }
});

bridge.on("connected", () => {
  streamDeck.logger.info("Connected to Lightroom bridge");
});
bridge.on("disconnected", () => {
  streamDeck.logger.warn("Disconnected from Lightroom bridge");
});

bridge.start();
streamDeck.connect();
