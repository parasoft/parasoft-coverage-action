import * as core from '@actions/core';
import * as runner from "./runner";
import { messages, messagesFormatter } from './messages';

export async function run() {
    try {
        const runOptions: runner.RunOptions = {
            report: core.getInput("report", { required: true }),
            parasoftToolOrJavaRootPath: core.getInput("parasoftToolOrJavaRootPath", { required: false })
        };
        const theRunner = new runner.CoverageParserRunner();
        const outcome = await theRunner.run(runOptions);

        if (outcome.exitCode != 0) {
            core.setFailed(messagesFormatter.format(messages.failed_convert_report, outcome.exitCode));
            return;
        }
        core.info(messagesFormatter.format(messages.exit_code, outcome.exitCode));
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