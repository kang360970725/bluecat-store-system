import { NSelect as NaiveSelect, selectProps } from 'naive-ui';
import { defineComponent, h } from 'vue';

// Keep menus outside modal and drawer scroll containers. Naive UI still
// positions the menu against its trigger and manages the overlay order.
export const NSelect = defineComponent({
  name: 'BlueCatSelect',
  inheritAttrs: false,
  props: {
    ...selectProps,
    to: { ...selectProps.to, default: true }
  },
  setup(props, { attrs, slots }) {
    return () => h(NaiveSelect, { ...attrs, ...props }, slots);
  }
});
