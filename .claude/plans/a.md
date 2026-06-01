You are performing a full migration and refactor of a Next.js "Add Bot" form
feature into a TanStack Start application. The source consists of two files:
  - BotForm.tsx        (reusable form component)

Target stack:
  - TanStack Start   (SSR-capable file-based routing framework)
  - TanStack Router  (typed routes, loaders, beforeLoad guards)
  - TanStack Form    (headless form primitives, field-level reactivity)
  - Effect-TS        (typed errors, async pipelines, Schema validation)
  - Cloudinary SDK   (image upload/delete, unchanged)
  - DOMPurify        (Markdown sanitization, unchanged)
  - shadcn/ui        (UI primitives, unchanged)

════════════════════════════════════════
PART 1 — ROUTING & AUTH GUARD
════════════════════════════════════════

1. Create a TanStack Router route at /add-bot using the file-based
   convention (e.g., routes/_protected/add-bot.tsx).

2. Add a beforeLoad guard on this route that:
   a. Reads the current session from a server-side context (injected via
      TanStack Start's createServerFn or router context).
   b. If unauthenticated, throws a redirect() to the Discord OAuth entry
      point — eliminating the useEffect-based redirect anti-pattern.
   c. Passes the authenticated user's discordId into the route's loader
      context so the page component never re-fetches auth state.

3. The route loader should prefetch nothing beyond auth. Heavy data
   (bot existence check, Discord RPC) happens inside the Effect pipeline
   at submit time to keep the page fast to load.

════════════════════════════════════════
PART 2 — EFFECT-TS ERROR MODEL
════════════════════════════════════════

4. Define a discriminated union of typed errors covering every failure
   mode in the submission pipeline:

   class InvalidInviteUrl    extends Data.TaggedError("InvalidInviteUrl")<{ url: string }>
   class BotAlreadyExists    extends Data.TaggedError("BotAlreadyExists")<{ id: string }>
   class DiscordRpcFailed    extends Data.TaggedError("DiscordRpcFailed")<{ status: number }>
   class SubmitBotFailed     extends Data.TaggedError("SubmitBotFailed")<{ message: string }>
   class NotificationFailed  extends Data.TaggedError("NotificationFailed")<{}>
   class ImageUploadFailed   extends Data.TaggedError("ImageUploadFailed")<{ filename: string }>

5. Replace the monolithic handleCreate async function with an Effect
   pipeline composed of small, named steps:

   const submitPipeline = (data, screenshots, banner) =>
     Effect.gen(function* () {
       const clientId  = yield* parseClientId(data.botInvite)
       yield* assertBotNotExists(clientId)
       const rpc       = yield* fetchBotRpc(clientId)
       const userInfo  = yield* fetchDiscordUser(clientId)
       const botData   = yield* buildBotPayload(data, rpc, userInfo, screenshots, banner)
       yield* persistBot(botData)
       yield* notifyDevelopers(data)
       yield* sendPendingWebhook(data, rpc.icon)
     }).pipe(
       Effect.tapError(e => Effect.sync(() => console.error(e))),
     )

   Each step is its own Effect that returns a typed error on the left
   channel. The caller maps each error tag to a user-facing message.

════════════════════════════════════════
PART 3 — EFFECT SCHEMA (REPLACE ZOD)
════════════════════════════════════════

6. Migrate botFormSchema from Zod to Effect Schema:

   import { Schema } from "effect"

   const BotFormSchema = Schema.Struct({
     botName:            Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
     botPrefix:          Schema.String.pipe(Schema.minLength(1), Schema.maxLength(10)),
     botDescription:     Schema.String.pipe(Schema.minLength(10), Schema.maxLength(200)),
     botLongDescription: Schema.String.pipe(Schema.minLength(1)),
     botInvite:          Schema.String.pipe(Schema.pattern(/discord\.com\/oauth2\/authorize/)),
     botWebsite:         Schema.optional(Schema.String),
     botSupport:         Schema.optional(Schema.String),
     developers:         Schema.Array(Schema.Struct({ name: Schema.String })),
     commands:           Schema.Array(CommandSchema),
     tags:               Schema.Array(Schema.String),
     secret:             Schema.optional(Schema.String),
     webhook_url:        Schema.optional(Schema.String),
   })

   Export the inferred TypeScript type:
   type BotFormData = Schema.Schema.Type<typeof BotFormSchema>

════════════════════════════════════════
PART 4 — TANSTACK FORM INTEGRATION
════════════════════════════════════════

7. Replace useForm (react-hook-form) with TanStack Form's useForm:

   const form = useForm({
     defaultValues: { botName: "", botPrefix: "", ... },
     validators: {
       onChange: ({ value }) =>
         Schema.decodeUnknownSync(BotFormSchema)(value),
     },
     onSubmit: async ({ value }) => {
       const result = await Effect.runPromiseExit(
         submitPipeline(value, screenshotPreviews, bannerPreviews[0]?.url)
       )
       Exit.match(result, {
         onFailure: cause => handleCause(cause),
         onSuccess: ()    => handleSuccess(),
       })
     },
   })

8. Replace every <FormField control={control} name="x"> with
   TanStack Form's <form.Field name="x"> render-prop pattern:

   <form.Field name="botName" children={(field) => (
     <FormItem>
       <FormLabel>Bot Name *</FormLabel>
       <Input
         value={field.state.value}
         onBlur={field.handleBlur}
         onChange={e => field.handleChange(e.target.value)}
       />
       {field.state.meta.errors.length > 0 && (
         <FormMessage>{field.state.meta.errors[0]}</FormMessage>
       )}
     </FormItem>
   )} />

9. Implement field-level localStorage persistence by subscribing to
   form.store inside a useEffect, writing only the two long-text fields
   ('botDescription', 'botLongDescription') to localStorage on change,
   and seeding defaultValues from localStorage in the initializer.
   Remove the usePersistedFormField custom hook entirely.

════════════════════════════════════════
PART 5 — IMAGE UPLOAD REFACTOR
════════════════════════════════════════

10. Extract the upload and deletion logic into two Effects:

    const uploadImages = (files: File[]): Effect<Screenshot[], ImageUploadFailed> =>
      Effect.tryPromise({
        try: () => ScreenshotUpload(files),
        catch: () => new ImageUploadFailed({ filename: files[0].name }),
      })

    const deleteImage = (publicId: string): Effect<void, never> =>
      Effect.promise(() => deleteCloudinaryImage(publicId))

    Keep the MAX_IMAGE_SIZE_BYTES / MAX_GIF_SIZE_BYTES guards but move
    them into a pure validateFiles(files) => Effect<File[], never> step
    that emits toast warnings as a side effect via Effect.tap.

11. Merge the two upload state arrays (screenshotPreviews, bannerPreviews)
    into one piece of state:

    type MediaState = { screenshots: Screenshot[]; banner: Screenshot | null }

    Drive both <ScreenshotGrid> instances from this single state atom to
    eliminate duplicated handler wiring.

════════════════════════════════════════
PART 6 — SSR / HYDRATION
════════════════════════════════════════

12. Remove the isClient useState + useEffect gate entirely. TanStack
    Start handles SSR correctly; replace it with a Suspense boundary at
    the route level if any child requires client-only rendering.

13. The Markdown preview div (DOMPurify + MarkdownRenderer) should be
    wrapped in a <ClientOnly> helper or rendered inside a
    useIsomorphicLayoutEffect to guarantee sanitization only runs
    client-side without suppressing the full page.

════════════════════════════════════════
PART 7 — SERVER FUNCTIONS
════════════════════════════════════════

14. Migrate submitBot, sendNotification, and sendPendingWebhook to
    TanStack Start createServerFn calls so they can be called directly
    from client code with full type safety and no manual fetch boilerplate.

15. Each server function should internally run the same Effect pipeline
    steps and return a serializable { success, error } discriminated union
    — never throw across the server/client boundary.

════════════════════════════════════════
CONSTRAINTS & NON-GOALS
════════════════════════════════════════

- Do NOT change UI layout, component names, or text strings (Chinese labels preserved).
- Do NOT add new UI features beyond what exists today.
- Preserve the scroll-sync logic between textarea and preview div exactly.
- shadcn/ui component APIs remain unchanged.
- All Cloudinary credentials stay server-side only.
- Keep DOMPurify sanitization on every render of the preview pane.
- Maintain the 5-screenshot / 1-banner hard cap enforcement.

════════════════════════════════════════
DELIVERABLES
════════════════════════════════════════

Produce the following files in order:

  1. src/errors/bot-errors.ts            — Effect Data.TaggedError definitions
  2. src/schemas/bot-form-schema.ts      — Effect Schema replacing Zod schema
  3. src/server/fns/submit-bot.ts        — createServerFn wrapping Effect pipeline
  4. src/server/fns/send-notification.ts — createServerFn
  5. src/components/form/BotForm.tsx     — migrated form component (TanStack Form)
  6. src/routes/bots/add.tsx             — route file with beforeLoad guard + page