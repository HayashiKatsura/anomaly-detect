import axios from "axios";
import { API_URL } from "@/url.js";


// 文件
export const getStorage = async ({
  file_type = null,
  file_id = null,
  page = 1,
  page_size = 10
} = {}) => {
  const params = { page, page_size };
  if (file_type) params.file_type = file_type;
  if (file_id) params.file_id = file_id;
  return axios.get(`${API_URL}/storage-data`, { params });
};

export const deleteFiles = async (file_ids: number[] | string[]) => {
  return axios.delete(`${API_URL}/delete-files`, {
    data: { file_ids }
  });
};


// 预测
export const predictFiles = async (weight_id, file_ids) => {
  return axios.post(`${API_URL}/prediction`, {
    weight_id: Number(weight_id),
    files_ids: file_ids.map(id => Number(id))
  });
};


export const showPredictions = async (file_id, page = 1, page_size = 10) => {
  return axios.get(`${API_URL}/prediction-data/${file_id}`,
    {
      params: {
        page : page,
        page_size : page_size
      }
    }
  );
};


// 验证
export const validateWeights = async (dataset_id, conf,weights_ids) => {
  return axios.post(`${API_URL}/validation`, {
    dataset_id: Number(dataset_id),
    conf: conf,
    weights_ids: weights_ids.map(id => Number(id))
  });
};

export const showValidations = async (weights_id, page = 1, page_size = 10) => {
  return axios.get(`${API_URL}/validation-data/${weights_id}`,
    {
      params: {
        page : page,
        page_size : page_size
      }
    }
  );
};


// 训练
export const startTraining = async (trainParams) => {
  return axios.post(`${API_URL}/start-training`, trainParams);
};

export const stopTraining = async (pid) => {
  return axios.delete(`${API_URL}/stop-training/${pid}`);
};

export const getTrainingLog = async (pid,lineNo=null) => {
  return axios.get(`${API_URL}/show-training/${pid}`,
    {
      params: {
        line_no : lineNo,
      }
    }
  );
};









export const FilesType = Object.freeze({
  PREDICTED_IMAGE: 'predicted_image',
  VALIDATED_IMAGE:  'validated_image',
  IMAGE: 'image',
  DOCUMENT: 'document',
  VIDEO: 'video',
  PREDICTED_VIDEO : 'predicted_video',
  AUDIO: 'audio',
  OTHER: 'other',
  TRAINING_LOG: 'training_log'
});
