CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"structured" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_reply_to_id" uuid,
	"target_role" text,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"dossier_hash" text NOT NULL,
	"dossier" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision" jsonb,
	"usage" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"role" text NOT NULL,
	"vote" text NOT NULL,
	"rationale" text NOT NULL,
	"dissent" boolean DEFAULT false NOT NULL,
	"proposal_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"bundle" jsonb NOT NULL,
	"consent_text_hash" text NOT NULL,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"user_agent" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"actor" text NOT NULL,
	"factual" boolean DEFAULT true NOT NULL,
	"from_status" text,
	"to_status" text,
	"ref_type" text,
	"ref_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"document_id" uuid,
	"fact" jsonb,
	"credibility" text DEFAULT 'medium' NOT NULL,
	"added_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"run_id" uuid,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"strategy" jsonb NOT NULL,
	"scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hard_gates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'DETECTED' NOT NULL,
	"priority" text DEFAULT 'p2' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"bureaus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"account_key" text,
	"creditor_name" text,
	"contested_field" text,
	"contested_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"desired_correction" text,
	"source_report_date" timestamp with time zone,
	"mode" text DEFAULT 'demo' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_case_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merged_into_case_id" uuid,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" text,
	"next_action_due_at" timestamp with time zone,
	"estimated_dates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discrepancy_id" uuid,
	"recommended_channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "cases_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"text_version" text DEFAULT 'v1' NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_key" text,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"field" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"values" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actionable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"case_id" uuid,
	"fingerprint" text NOT NULL,
	"mode" text DEFAULT 'demo' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"page_count" integer,
	"text_extracted" text,
	"extraction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sensitivity" text DEFAULT 'sensitive' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "freeze_agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"portal_url" text,
	"phone" text,
	"mail_address" jsonb,
	"request_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supports_api" boolean DEFAULT false NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"last_verified_at" timestamp with time zone,
	CONSTRAINT "freeze_agencies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "freeze_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"evidence_document_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freeze_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"action" text DEFAULT 'freeze' NOT NULL,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"request_method" text,
	"request_ref" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmation_document_id" uuid,
	"confirmation_ref" text,
	"lift_start_at" timestamp with time zone,
	"lift_end_at" timestamp with time zone,
	"notes" text,
	"last_error" text,
	"mode" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"external_id" text,
	"status" text NOT NULL,
	"sender_name" text,
	"sender_address" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"envelope_document_id" uuid,
	"content_document_id" uuid,
	"page_count" integer,
	"extraction" jsonb,
	"matched_case_id" uuid,
	"match_confidence" numeric(4, 3),
	"match_method" text,
	"unread" boolean DEFAULT true NOT NULL,
	"duplicate_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bureau" text NOT NULL,
	"subscriber_name" text NOT NULL,
	"inquiry_date" timestamp with time zone NOT NULL,
	"type" text DEFAULT 'hard' NOT NULL,
	"purpose" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"idempotency_key" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"plan_id" uuid,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"letter_type" text NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient" jsonb NOT NULL,
	"sender" jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"enclosures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_document_id" uuid,
	"pdf_sha256" text,
	"created_by" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mail_order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"applied" boolean DEFAULT true NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"letter_id" uuid NOT NULL,
	"approval_id" uuid,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_order_id" text,
	"mail_class" text DEFAULT 'first_class' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipient" jsonb NOT NULL,
	"cost_estimate_cents" integer,
	"cost_actual_cents" integer,
	"pdf_sha256" text,
	"submitted_at" timestamp with time zone,
	"mailed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"expected_delivery_date" timestamp with time zone,
	"tracking_number" text,
	"tracking_supported" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "monitoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bureau" text,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"fingerprint" text NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_id" uuid,
	"previous_snapshot_id" uuid,
	"entity_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"case_id" uuid,
	"mode" text DEFAULT 'demo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text DEFAULT 'demo' NOT NULL,
	"status" text DEFAULT 'not_connected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supports_webhooks" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"next_eligible_check_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bureau" text NOT NULL,
	"source" text NOT NULL,
	"mode" text DEFAULT 'demo' NOT NULL,
	"report_date" timestamp with time zone NOT NULL,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid,
	"personal_info" jsonb NOT NULL,
	"score" jsonb,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"inbound_mail_id" uuid NOT NULL,
	"run_id" uuid,
	"category" text NOT NULL,
	"matched_scenario_key" text,
	"summary" text NOT NULL,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_next_action" text NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tradelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bureau" text NOT NULL,
	"account_key" text NOT NULL,
	"creditor_name" text NOT NULL,
	"account_number_masked" text NOT NULL,
	"account_type" text NOT NULL,
	"ownership" text DEFAULT 'individual' NOT NULL,
	"status" text NOT NULL,
	"payment_status" text NOT NULL,
	"opened_date" timestamp with time zone,
	"reported_date" timestamp with time zone,
	"closed_date" timestamp with time zone,
	"date_first_delinquency" timestamp with time zone,
	"balance" numeric(12, 2),
	"credit_limit" numeric(12, 2),
	"high_balance" numeric(12, 2),
	"past_due" numeric(12, 2),
	"monthly_payment" numeric(12, 2),
	"original_creditor" text,
	"payment_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remarks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"automation_mode" text DEFAULT 'recommend_and_draft' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_enc" text,
	"mailing_address" jsonb,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_votes" ADD CONSTRAINT "agent_votes_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_plans" ADD CONSTRAINT "case_plans_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze_events" ADD CONSTRAINT "freeze_events_request_id_freeze_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."freeze_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze_requests" ADD CONSTRAINT "freeze_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze_requests" ADD CONSTRAINT "freeze_requests_agency_id_freeze_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."freeze_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_mail" ADD CONSTRAINT "inbound_mail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_snapshot_id_report_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."report_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_events" ADD CONSTRAINT "mail_events_mail_order_id_mail_orders_id_fk" FOREIGN KEY ("mail_order_id") REFERENCES "public"."mail_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_orders" ADD CONSTRAINT "mail_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_orders" ADD CONSTRAINT "mail_orders_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_analyses" ADD CONSTRAINT "response_analyses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradelines" ADD CONSTRAINT "tradelines_snapshot_id_report_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."report_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_run_idx" ON "agent_messages" USING btree ("run_id","round","seq");--> statement-breakpoint
CREATE INDEX "agent_runs_case_idx" ON "agent_runs" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_votes_run_role_idx" ON "agent_votes" USING btree ("run_id","role");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "case_events_case_idx" ON "case_events" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "case_evidence_label_idx" ON "case_evidence" USING btree ("case_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "case_plans_case_version_idx" ON "case_plans" USING btree ("case_id","version");--> statement-breakpoint
CREATE INDEX "cases_user_status_idx" ON "cases" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_user_kind_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "discrepancies_fingerprint_idx" ON "discrepancies" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "documents_user_idx" ON "documents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "freeze_events_request_idx" ON "freeze_events" USING btree ("request_id","occurred_at");--> statement-breakpoint
CREATE INDEX "freeze_requests_user_idx" ON "freeze_requests" USING btree ("user_id","agency_id");--> statement-breakpoint
CREATE INDEX "inbound_mail_status_idx" ON "inbound_mail" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_mail_external_idx" ON "inbound_mail" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "inquiries_snapshot_idx" ON "inquiries" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_idx" ON "jobs" USING btree ("idempotency_key") WHERE "jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "letters_case_version_idx" ON "letters" USING btree ("case_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_events_external_idx" ON "mail_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "mail_orders_case_idx" ON "mail_orders" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_events_fingerprint_idx" ON "monitoring_events" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_user_kind_provider_idx" ON "provider_connections" USING btree ("user_id","kind","provider");--> statement-breakpoint
CREATE INDEX "report_snapshots_user_bureau_idx" ON "report_snapshots" USING btree ("user_id","bureau","report_date");--> statement-breakpoint
CREATE INDEX "tradelines_user_key_idx" ON "tradelines" USING btree ("user_id","account_key");--> statement-breakpoint
CREATE INDEX "tradelines_snapshot_idx" ON "tradelines" USING btree ("snapshot_id");