// Embed customisation options. Data, not code: add a row here and it shows up
// in the panel and in the intent JSON. Sources: create-intent schema
// (docs.moneyhash.io) and shop.moneyhash.io.

export type EmbedOption =
  | {
      key: string;
      label: string;
      help: string;
      where: 'body' | 'query';
      kind: 'boolean';
      group: Group;
    }
  | {
      key: string;
      label: string;
      help: string;
      where: 'body' | 'query';
      kind: 'text' | 'number' | 'list';
      group: Group;
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      help: string;
      where: 'body' | 'query';
      kind: 'select';
      group: Group;
      choices: string[];
    };

type Group =
  | 'Layout'
  | 'Buttons and messages'
  | 'Behaviour'
  | 'Redirect URLs'
  | 'Embed URL';

export const EMBED_OPTION_GROUPS: Group[] = [
  'Layout',
  'Buttons and messages',
  'Behaviour',
  'Redirect URLs',
  'Embed URL',
];

export const EMBED_OPTIONS: EmbedOption[] = [
  // Layout
  {
    key: 'hide_header',
    label: 'Hide header',
    help: 'Removes the MoneyHash header at the top of the page.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hide_payment_header',
    label: 'Hide payment header',
    help: 'Removes the header above the payment form.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hide_amount_sidebar',
    label: 'Hide amount sidebar',
    help: 'Removes the order amount panel.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hide_payment_method_selector',
    label: 'Hide method selector',
    help: 'Hides the list of payment methods.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hide_navigation_to_payment_methods',
    label: 'Hide "back to methods"',
    help: 'Stops the customer from going back to the method list.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hide_filled_billing_fields',
    label: 'Hide filled billing fields',
    help: 'Hides billing fields you already sent in billing_data.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'form_only',
    label: 'Form only',
    help: 'Shows only the payment form, without the page around it.',
    where: 'body',
    kind: 'boolean',
    group: 'Layout',
  },
  {
    key: 'hidden_methods',
    label: 'Hidden methods',
    help: 'Payment methods to hide, comma separated (e.g. CARD, APPLE_PAY).',
    where: 'body',
    kind: 'list',
    group: 'Layout',
    placeholder: 'CARD, APPLE_PAY',
  },

  // Buttons and messages
  {
    key: 'hide_loader_message',
    label: 'Hide loader message',
    help: 'Hides the text shown while the page loads.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'hide_form_header_message',
    label: 'Hide form header message',
    help: 'Hides the message above the form.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'hide_retry_button',
    label: 'Hide retry button',
    help: 'Hides "retry" after a failed payment.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'hide_try_different_method_button',
    label: 'Hide "try another method"',
    help: 'Hides the button that lets the customer switch method after a failure.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'hide_iframe_go_back',
    label: 'Hide iframe back button',
    help: 'Hides the back button inside the iframe.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'show_back_to_merchant_button',
    label: 'Show "back to merchant"',
    help: 'Adds a button that returns the customer to your site.',
    where: 'body',
    kind: 'boolean',
    group: 'Buttons and messages',
  },
  {
    key: 'success_message',
    label: 'Success message',
    help: 'Custom text on the success screen.',
    where: 'body',
    kind: 'text',
    group: 'Buttons and messages',
  },
  {
    key: 'fail_message',
    label: 'Failure message',
    help: 'Custom text on the failure screen.',
    where: 'body',
    kind: 'text',
    group: 'Buttons and messages',
  },

  // Behaviour
  {
    key: 'redirect_strategy',
    label: 'Redirect strategy',
    help: 'Where MoneyHash opens redirects (3DS, wallets): inside the embed, the whole window, or a new tab.',
    where: 'body',
    kind: 'select',
    group: 'Behaviour',
    choices: [
      'redirect_inside_embed',
      'redirect_entire_window',
      'redirect_to_new_tab',
    ],
  },
  {
    key: 'show_save_card_checkbox',
    label: 'Show "save card"',
    help: 'Lets the customer choose to save their card. Needs a customer.',
    where: 'body',
    kind: 'boolean',
    group: 'Behaviour',
  },
  {
    key: 'expires_after_seconds',
    label: 'Expires after (seconds)',
    help: 'The intent expires after this many seconds.',
    where: 'body',
    kind: 'number',
    group: 'Behaviour',
    placeholder: '900',
  },
  {
    key: 'show_countdown_timer',
    label: 'Show countdown',
    help: 'Shows the time left. Needs "Expires after".',
    where: 'body',
    kind: 'boolean',
    group: 'Behaviour',
  },
  {
    key: 'flow_id',
    label: 'Flow ID',
    help: 'Use a dashboard flow. Replaces "operation" (they cannot be sent together).',
    where: 'body',
    kind: 'text',
    group: 'Behaviour',
  },

  // Redirect URLs (empty = the playground order page)
  {
    key: 'successful_redirect_url',
    label: 'Success redirect',
    help: 'Where the customer lands after a successful payment.',
    where: 'body',
    kind: 'text',
    group: 'Redirect URLs',
  },
  {
    key: 'failed_redirect_url',
    label: 'Failure redirect',
    help: 'Where the customer lands after a failed payment.',
    where: 'body',
    kind: 'text',
    group: 'Redirect URLs',
  },
  {
    key: 'pending_external_action_redirect_url',
    label: 'Pending redirect',
    help: 'Where the customer lands when the payment waits for an outside action.',
    where: 'body',
    kind: 'text',
    group: 'Redirect URLs',
  },
  {
    key: 'back_url',
    label: 'Back URL',
    help: 'Where "back" takes the customer.',
    where: 'body',
    kind: 'text',
    group: 'Redirect URLs',
  },

  // Embed URL query parameters (only for flows that load embed_url)
  {
    key: 'lang',
    label: 'Language',
    help: 'Language of the embed page.',
    where: 'query',
    kind: 'select',
    group: 'Embed URL',
    choices: ['en', 'ar', 'fr'],
  },
];

export const REDIRECT_KEYS = EMBED_OPTIONS.filter(
  o => o.group === 'Redirect URLs',
).map(o => o.key);
