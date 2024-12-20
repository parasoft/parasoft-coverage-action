import * as fs from 'fs';
import * as pt from 'path';

interface ISerializable<T> {
    deserialize(jsonPath: string): T;
}

class Messages implements ISerializable<Messages>
{
    run_failed!: string;
    exit_code!: string;
    missing_coverage_data!: string;
    invalid_package_data!: string;
    invalid_coverage_rate!: string;
    negative_coverage_values!: string;

    deserialize(jsonPath: string) : Messages {
        const buf = fs.readFileSync(jsonPath);
        const json = JSON.parse(buf.toString('utf-8'));
        return json as Messages;
    }
}

const jsonPath = pt.join(__dirname, 'messages/messages.json');
export const messages = new Messages().deserialize(jsonPath)