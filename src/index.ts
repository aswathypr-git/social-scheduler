import 'dotenv/config';
import express from 'express';
import path from 'path';
import routes from './routes';
import { startScheduler } from './scheduler';


const app = express();
app.use(express.json());
app.use('/api', routes);


// serve static UI
app.use('/', express.static(path.join(__dirname, 'static')));


const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
console.log(`listening http://localhost:${port}`);
startScheduler();
});