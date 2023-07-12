import SQS from '@aws-sdk/client-sqs';
import Err from '@openaddresses/batch-error';

/**
 * @class
 */
export default class HookQueue {
    sqs: SQS.SQSClient;

    constructor() {
        this.sqs = new SQS.SQSClient({ region: process.env.AWS_DEFAULT_REGION });
    }

    async submit(connectionid: number, MessageBody: string) {
        try {
            const res = await this.sqs.send(new SQS.SendMessageCommand({
                QueueUrl: process.env.HookURL,
                MessageBody,
                MessageGroupId: String(connectionid)
            }));

            return res;
        } catch (err) {
            console.error(err);
            throw new Err(500, new Error(err), 'Failed to submit SQS Message');
        }
    }
}
