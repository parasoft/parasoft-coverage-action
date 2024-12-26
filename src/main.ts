import * as core from '@actions/core';
import * as runner from "./runner";

import {messages, messagesFormatter} from './messages';

export async function run() {
    try {
        // TODO: Add run options (eg., covReportDir) and pass them to run()
        const theRunner = new runner.CoverageParserRunner();
        const outcome = await theRunner.run();

        if (outcome.exitCode != 0) {
            // TODO: When implement cobertura transforming
        } else {
            core.info(messagesFormatter.format(messages.exit_code + outcome.exitCode));
        }
    } catch (error) {
        core.error(messages.run_failed);
        if (error instanceof Error) {
            core.error(error);
            core.setFailed(error.message);
        } else {
            const errorString = String(error);
            core.setFailed(`Unexpected error: ${errorString}`);
        }
    }
}

if (require.main === module) {
    run();
}